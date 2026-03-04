import {
  collectMySqlRecords,
  type MySqlQueryExecutor,
} from '../domain/collector/collect-mysql-records';
import {
  collectPostgresRecords,
  type CollectorStandardizedRecord,
  type PostgresQueryExecutor,
} from '../domain/collector/collect-postgres-records';
import {
  CollectorCursorConflictError,
  type CollectorCursorRecord,
  type CollectorCursorRepository,
  type CollectorCursorValue,
} from '../domain/collector/collector-cursor-repository';
import {
  loadCollectorSourceCredentials,
  type CollectorSecretRepository,
  type CollectorSecretRetryPolicy,
  type CollectorSourceCredentials,
} from '../domain/collector/load-source-credentials';
import {
  loadCollectorSourceConfiguration,
  type CollectorSourceConfigurationRepository,
} from '../domain/collector/load-source-configuration';
import { createMySqlQueryExecutorFactory } from '../infra/collector/mysql-query-executor';
import { createPostgresQueryExecutorFactory } from '../infra/collector/postgres-query-executor';
import { createDynamoDbCollectorCursorRepository } from '../infra/cursors/dynamodb-collector-cursor-repository';
import { createSecretsManagerSecretRepository } from '../infra/secrets/secrets-manager-secret-repository';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { nowIso } from '../shared/time/now-iso';

const COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_DEFAULT = 3;
const COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MIN = 1;
const COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MAX = 5;
const COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_DEFAULT = 200;
const COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MIN = 10;
const COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MAX = 2000;
const COLLECTOR_SECRET_RETRY_BACKOFF_RATE_DEFAULT = 2;
const COLLECTOR_SECRET_RETRY_BACKOFF_RATE_MIN = 1;
const COLLECTOR_SECRET_RETRY_BACKOFF_RATE_MAX = 5;
const COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS_DEFAULT = 5;
const COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS_MIN = 1;
const COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS_MAX = 20;
const COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS_DEFAULT = 10_000;
const COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS_MIN = 100;
const COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS_MAX = 120_000;
const COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS_DEFAULT = 5_000;
const COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS_MIN = 100;
const COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS_MAX = 60_000;
const COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS_DEFAULT = 5;
const COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS_MIN = 1;
const COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS_MAX = 20;
const COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS_DEFAULT = 10_000;
const COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS_MIN = 100;
const COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS_MAX = 120_000;
const COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS_DEFAULT = 5_000;
const COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS_MIN = 100;
const COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS_MAX = 60_000;
const COLLECTOR_MYSQL_QUERY_TIMEOUT_MS_DEFAULT = 5_000;
const COLLECTOR_MYSQL_QUERY_TIMEOUT_MS_MIN = 100;
const COLLECTOR_MYSQL_QUERY_TIMEOUT_MS_MAX = 120_000;
const COLLECTOR_DEFAULT_CURSOR_FALLBACK = '1970-01-01T00:00:00.000Z';
const COLLECTOR_CURSOR_UPDATE_MAX_CONFLICT_RETRIES = 3;
const NUMERIC_CURSOR_REGEX = /^[-+]?\d+(\.\d+)?$/;

type PostgresQueryExecutorFactory = (credentials: CollectorSourceCredentials) => PostgresQueryExecutor;
type MySqlQueryExecutorFactory = (credentials: CollectorSourceCredentials) => MySqlQueryExecutor;

export interface CollectorEvent {
  sourceId: string;
  cursor?: string | number | null;
  meta?: {
    executionId?: string;
    stage?: string;
  };
}

export interface CollectorResult {
  sourceId: string;
  processedAt: string;
  recordsSent: number;
  records: CollectorStandardizedRecord[];
}

export interface CollectorDependencies {
  sourceRegistryRepository: CollectorSourceConfigurationRepository;
  cursorRepository: CollectorCursorRepository;
  secretRepository: CollectorSecretRepository;
  postgresQueryExecutorFactory: PostgresQueryExecutorFactory;
  mySqlQueryExecutorFactory: MySqlQueryExecutorFactory;
  secretRetryPolicy: CollectorSecretRetryPolicy;
  defaultCursorValue: string;
  now: () => string;
  nowMs: () => number;
  sleep: (delayMs: number) => Promise<void>;
  logger: Pick<typeof console, 'info'>;
}

let cachedDefaultDependencies: CollectorDependencies | undefined;

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const resolveBoundedIntegerFromEnv = ({
  rawValue,
  envName,
  min,
  max,
  fallback,
}: {
  rawValue: string | undefined;
  envName: string;
  min: number;
  max: number;
  fallback: number;
}): number => {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  const isValidInteger = Number.isInteger(parsed);
  const isInRange = parsed >= min && parsed <= max;

  if (!isValidInteger || !isInRange) {
    throw new Error(`Invalid ${envName}="${rawValue}". Expected integer between ${min} and ${max}.`);
  }

  return parsed;
};

const resolveRetryMaxAttempts = (rawValue: string | undefined): number => {
  return resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS',
    min: COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MIN,
    max: COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MAX,
    fallback: COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_DEFAULT,
  });
};

const resolveRetryBaseDelayMs = (rawValue: string | undefined): number => {
  return resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_SECRET_RETRY_BASE_DELAY_MS',
    min: COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MIN,
    max: COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MAX,
    fallback: COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_DEFAULT,
  });
};

const resolveRetryBackoffRate = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return COLLECTOR_SECRET_RETRY_BACKOFF_RATE_DEFAULT;
  }

  const parsed = Number.parseFloat(rawValue);
  const isValidNumber = Number.isFinite(parsed);
  const isInRange =
    parsed >= COLLECTOR_SECRET_RETRY_BACKOFF_RATE_MIN &&
    parsed <= COLLECTOR_SECRET_RETRY_BACKOFF_RATE_MAX;

  if (!isValidNumber || !isInRange) {
    throw new Error(
      `Invalid COLLECTOR_SECRET_RETRY_BACKOFF_RATE="${rawValue}". Expected number between ${COLLECTOR_SECRET_RETRY_BACKOFF_RATE_MIN} and ${COLLECTOR_SECRET_RETRY_BACKOFF_RATE_MAX}.`,
    );
  }

  return parsed;
};

const resolvePostgresPoolMaxConnections = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS',
    min: COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS_MIN,
    max: COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS_MAX,
    fallback: COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS_DEFAULT,
  });

const resolvePostgresPoolIdleTimeoutMs = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS',
    min: COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS_MIN,
    max: COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS_MAX,
    fallback: COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS_DEFAULT,
  });

const resolvePostgresPoolConnectionTimeoutMs = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS',
    min: COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS_MIN,
    max: COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS_MAX,
    fallback: COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS_DEFAULT,
  });

const resolveMySqlPoolMaxConnections = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS',
    min: COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS_MIN,
    max: COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS_MAX,
    fallback: COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS_DEFAULT,
  });

const resolveMySqlPoolIdleTimeoutMs = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS',
    min: COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS_MIN,
    max: COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS_MAX,
    fallback: COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS_DEFAULT,
  });

const resolveMySqlPoolConnectionTimeoutMs = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS',
    min: COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS_MIN,
    max: COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS_MAX,
    fallback: COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS_DEFAULT,
  });

const resolveMySqlQueryTimeoutMs = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_MYSQL_QUERY_TIMEOUT_MS',
    min: COLLECTOR_MYSQL_QUERY_TIMEOUT_MS_MIN,
    max: COLLECTOR_MYSQL_QUERY_TIMEOUT_MS_MAX,
    fallback: COLLECTOR_MYSQL_QUERY_TIMEOUT_MS_DEFAULT,
  });

const resolveDefaultCursorValue = (rawValue: string | undefined): string => {
  if (!rawValue) {
    return COLLECTOR_DEFAULT_CURSOR_FALLBACK;
  }

  const normalized = rawValue.trim();
  if (normalized.length === 0) {
    throw new Error('COLLECTOR_DEFAULT_CURSOR cannot be empty.');
  }

  return normalized;
};

const resolveCursorValue = (
  eventCursor: CollectorEvent['cursor'],
  persistedCursor: CollectorCursorValue | undefined,
  defaultCursorValue: string,
): CollectorCursorValue => {
  if (typeof eventCursor === 'string') {
    const normalized = eventCursor.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (typeof eventCursor === 'number' && Number.isFinite(eventCursor)) {
    return eventCursor;
  }

  if (typeof persistedCursor === 'string') {
    const normalized = persistedCursor.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (typeof persistedCursor === 'number' && Number.isFinite(persistedCursor)) {
    return persistedCursor;
  }

  return defaultCursorValue;
};

const toNumericCursor = (value: CollectorCursorValue): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = value.trim();
  if (!NUMERIC_CURSOR_REGEX.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const compareCursorValues = (left: CollectorCursorValue, right: CollectorCursorValue): number => {
  const leftNumeric = toNumericCursor(left);
  const rightNumeric = toNumericCursor(right);

  if (leftNumeric !== null && rightNumeric !== null) {
    return leftNumeric === rightNumeric ? 0 : leftNumeric > rightNumeric ? 1 : -1;
  }

  const leftString = String(left);
  const rightString = String(right);
  return leftString.localeCompare(rightString);
};

const extractCursorValue = (value: unknown): CollectorCursorValue | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isNaN(timestamp)) {
      return value.toISOString();
    }
  }

  return null;
};

const resolveLatestCursorFromRecords = ({
  records,
  cursorField,
}: {
  records: readonly CollectorStandardizedRecord[];
  cursorField: string;
}): CollectorCursorValue | null => {
  let latestCursor: CollectorCursorValue | null = null;

  for (const record of records) {
    const candidate = extractCursorValue(record[cursorField]);
    if (candidate === null) {
      continue;
    }

    if (latestCursor === null || compareCursorValues(candidate, latestCursor) > 0) {
      latestCursor = candidate;
    }
  }

  return latestCursor;
};

const persistCollectorCursor = async ({
  sourceId,
  candidateCursor,
  initialSnapshot,
  cursorRepository,
  updatedAt,
  logger,
}: {
  sourceId: string;
  candidateCursor: CollectorCursorValue;
  initialSnapshot: CollectorCursorRecord | null;
  cursorRepository: CollectorCursorRepository;
  updatedAt: string;
  logger: Pick<typeof console, 'info'>;
}): Promise<void> => {
  let snapshot = initialSnapshot;
  let conflictRetries = 0;

  for (;;) {
    const persistedCursor = snapshot?.last;
    if (
      persistedCursor !== undefined &&
      compareCursorValues(candidateCursor, persistedCursor) <= 0
    ) {
      logger.info('collector.cursor.update_skipped', {
        sourceId,
        reason: 'no-advance',
        persistedCursor,
        candidateCursor,
      });
      return;
    }

    try {
      await cursorRepository.save({
        source: sourceId,
        last: candidateCursor,
        updatedAt,
        expectedUpdatedAt: snapshot?.updatedAt,
      });

      logger.info('collector.cursor.updated', {
        sourceId,
        previousCursor: persistedCursor ?? null,
        nextCursor: candidateCursor,
        conflictRetries,
      });
      return;
    } catch (error) {
      if (!(error instanceof CollectorCursorConflictError)) {
        throw error;
      }

      conflictRetries += 1;
      if (conflictRetries > COLLECTOR_CURSOR_UPDATE_MAX_CONFLICT_RETRIES) {
        throw error;
      }

      snapshot = await cursorRepository.getBySource(sourceId);
    }
  }
};

const getDefaultDependencies = (): CollectorDependencies => {
  if (cachedDefaultDependencies) {
    return cachedDefaultDependencies;
  }

  const tableName = process.env.SOURCES_TABLE_NAME;
  if (!tableName || tableName.trim().length === 0) {
    throw new Error('SOURCES_TABLE_NAME is required.');
  }

  const cursorsTableName = process.env.CURSORS_TABLE_NAME;
  if (!cursorsTableName || cursorsTableName.trim().length === 0) {
    throw new Error('CURSORS_TABLE_NAME is required.');
  }

  cachedDefaultDependencies = {
    sourceRegistryRepository: createDynamoDbSourceRegistryRepository({ tableName }),
    cursorRepository: createDynamoDbCollectorCursorRepository({ tableName: cursorsTableName }),
    secretRepository: createSecretsManagerSecretRepository(),
    postgresQueryExecutorFactory: createPostgresQueryExecutorFactory({
      poolSettings: {
        maxConnections: resolvePostgresPoolMaxConnections(
          process.env.COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS,
        ),
        idleTimeoutMs: resolvePostgresPoolIdleTimeoutMs(
          process.env.COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS,
        ),
        connectionTimeoutMs: resolvePostgresPoolConnectionTimeoutMs(
          process.env.COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS,
        ),
      },
    }),
    mySqlQueryExecutorFactory: createMySqlQueryExecutorFactory({
      poolSettings: {
        maxConnections: resolveMySqlPoolMaxConnections(process.env.COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS),
        idleTimeoutMs: resolveMySqlPoolIdleTimeoutMs(process.env.COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS),
        connectionTimeoutMs: resolveMySqlPoolConnectionTimeoutMs(
          process.env.COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS,
        ),
        queryTimeoutMs: resolveMySqlQueryTimeoutMs(process.env.COLLECTOR_MYSQL_QUERY_TIMEOUT_MS),
      },
    }),
    secretRetryPolicy: {
      maxAttempts: resolveRetryMaxAttempts(process.env.COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS),
      baseDelayMs: resolveRetryBaseDelayMs(process.env.COLLECTOR_SECRET_RETRY_BASE_DELAY_MS),
      backoffRate: resolveRetryBackoffRate(process.env.COLLECTOR_SECRET_RETRY_BACKOFF_RATE),
    },
    defaultCursorValue: resolveDefaultCursorValue(process.env.COLLECTOR_DEFAULT_CURSOR),
    now: nowIso,
    nowMs: Date.now,
    sleep,
    logger: console,
  };

  return cachedDefaultDependencies;
};

export const createHandler =
  ({
    sourceRegistryRepository,
    cursorRepository,
    secretRepository,
    postgresQueryExecutorFactory,
    mySqlQueryExecutorFactory,
    secretRetryPolicy,
    defaultCursorValue,
    now,
    nowMs,
    sleep,
    logger,
  }: CollectorDependencies) =>
  async (event: CollectorEvent): Promise<CollectorResult> => {
    const sourceId = event?.sourceId?.trim() ?? '';
    if (sourceId.length === 0) {
      throw new Error('sourceId is required for collector execution.');
    }

    const sourceConfiguration = await loadCollectorSourceConfiguration({
      sourceId,
      sourceRegistryRepository,
    });

    const cursorSnapshot = await cursorRepository.getBySource(sourceId);
    logger.info('collector.cursor.loaded', {
      sourceId,
      hasPersistedCursor: cursorSnapshot !== null,
      persistedCursor: cursorSnapshot?.last ?? null,
    });

    const loadedCredentials = await loadCollectorSourceCredentials({
      sourceId,
      engine: sourceConfiguration.engine,
      secretArn: sourceConfiguration.secretArn,
      secretRepository,
      retryPolicy: secretRetryPolicy,
      nowMs,
      sleep,
    });

    logger.info('collector.source_credentials.loaded', {
      sourceId,
      engine: sourceConfiguration.engine,
      attempts: loadedCredentials.metrics.attempts,
      durationMs: loadedCredentials.metrics.durationMs,
    });

    const cursor = resolveCursorValue(event?.cursor, cursorSnapshot?.last, defaultCursorValue);

    let records: CollectorStandardizedRecord[];
    switch (sourceConfiguration.engine) {
      case 'postgres':
        records = await collectPostgresRecords({
          sourceId,
          queryTemplate: sourceConfiguration.query,
          cursor,
          postgresQueryExecutor: postgresQueryExecutorFactory(loadedCredentials.credentials),
        });
        break;
      case 'mysql':
        records = await collectMySqlRecords({
          sourceId,
          queryTemplate: sourceConfiguration.query,
          cursor,
          mySqlQueryExecutor: mySqlQueryExecutorFactory(loadedCredentials.credentials),
        });
        break;
      default:
        throw new Error(
          `Collector engine "${String(sourceConfiguration.engine)}" is not supported yet.`,
        );
    }

    logger.info('collector.source_records.collected', {
      sourceId,
      engine: sourceConfiguration.engine,
      cursor,
      recordsCollected: records.length,
    });

    const processedAt = now();
    const candidateCursor = resolveLatestCursorFromRecords({
      records,
      cursorField: sourceConfiguration.cursorField,
    });

    if (candidateCursor === null) {
      logger.info('collector.cursor.update_skipped', {
        sourceId,
        reason: 'no-cursor-value-found',
        cursorField: sourceConfiguration.cursorField,
        recordsCollected: records.length,
      });
    } else {
      await persistCollectorCursor({
        sourceId,
        candidateCursor,
        initialSnapshot: cursorSnapshot,
        cursorRepository,
        updatedAt: processedAt,
        logger,
      });
    }

    return {
      sourceId,
      processedAt,
      recordsSent: records.length,
      records,
    };
  };

export async function handler(event: CollectorEvent): Promise<CollectorResult> {
  return createHandler(getDefaultDependencies())(event);
}
