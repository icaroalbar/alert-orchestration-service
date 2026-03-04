import {
  collectPostgresRecords,
  type CollectorCursorValue,
  type CollectorStandardizedRecord,
  type PostgresQueryExecutor,
} from '../domain/collector/collect-postgres-records';
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
import { createPostgresQueryExecutorFactory } from '../infra/collector/postgres-query-executor';
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
const COLLECTOR_DEFAULT_CURSOR_FALLBACK = '1970-01-01T00:00:00.000Z';

type PostgresQueryExecutorFactory = (credentials: CollectorSourceCredentials) => PostgresQueryExecutor;

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
  secretRepository: CollectorSecretRepository;
  postgresQueryExecutorFactory: PostgresQueryExecutorFactory;
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
  defaultCursorValue: string,
): CollectorCursorValue => {
  if (typeof eventCursor === 'string') {
    const normalized = eventCursor.trim();
    if (normalized.length > 0) {
      return normalized;
    }

    return defaultCursorValue;
  }

  if (typeof eventCursor === 'number' && Number.isFinite(eventCursor)) {
    return eventCursor;
  }

  return defaultCursorValue;
};

const getDefaultDependencies = (): CollectorDependencies => {
  if (cachedDefaultDependencies) {
    return cachedDefaultDependencies;
  }

  const tableName = process.env.SOURCES_TABLE_NAME;
  if (!tableName || tableName.trim().length === 0) {
    throw new Error('SOURCES_TABLE_NAME is required.');
  }

  cachedDefaultDependencies = {
    sourceRegistryRepository: createDynamoDbSourceRegistryRepository({ tableName }),
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
    secretRepository,
    postgresQueryExecutorFactory,
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

    const cursor = resolveCursorValue(event?.cursor, defaultCursorValue);

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
      default:
        throw new Error(`Collector engine "${sourceConfiguration.engine}" is not supported yet.`);
    }

    logger.info('collector.source_records.collected', {
      sourceId,
      engine: sourceConfiguration.engine,
      cursor,
      recordsCollected: records.length,
    });

    return {
      sourceId,
      processedAt: now(),
      recordsSent: records.length,
      records,
    };
  };

export async function handler(event: CollectorEvent): Promise<CollectorResult> {
  return createHandler(getDefaultDependencies())(event);
}
