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
import type {
  CollectorIdempotencyRepository,
  CollectorIdempotencyScope,
} from '../domain/collector/collector-idempotency-repository';
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
import { mapRecordsWithFieldMap } from '../domain/collector/map-records-with-field-map';
import {
  validateCanonicalCustomerBatch,
  type CanonicalCustomerRejectedRecord,
} from '../domain/collector/validate-canonical-customer-batch';
import {
  createUpsertCustomersBatchClient,
  type UpsertCustomersBatchClient,
  type UpsertCustomersBatchHttpClient,
  type UpsertCustomersBatchRejectedRecord,
} from '../domain/collector/upsert-customers-batch';
import { createMySqlQueryExecutorFactory } from '../infra/collector/mysql-query-executor';
import { createPostgresQueryExecutorFactory } from '../infra/collector/postgres-query-executor';
import { createDynamoDbCollectorCursorRepository } from '../infra/cursors/dynamodb-collector-cursor-repository';
import { createDynamoDbCollectorIdempotencyRepository } from '../infra/idempotency/dynamodb-collector-idempotency-repository';
import {
  createCloudWatchMetricsPublisher,
  createNoopMetricsPublisher,
  type RuntimeMetricsPublisher,
} from '../infra/observability/cloudwatch-metrics-publisher';
import { createSecretsManagerSecretRepository } from '../infra/secrets/secrets-manager-secret-repository';
import { createSecretsManagerOutboundAuthHeadersResolver } from '../infra/security/secrets-manager-outbound-auth-headers-resolver';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { createSnsCustomerEventsPublisher, type CustomerEventsPublisher } from '../infra/events/sns-customer-events-publisher';
import { createStructuredLogger } from '../shared/logging/structured-logger';
import {
  buildTelemetryAttributes,
  toTelemetryLogContext,
  withTelemetrySpan,
  type TelemetryTraceContext,
} from '../shared/observability/open-telemetry';
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
const OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS_DEFAULT = 5_000;
const OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS_MIN = 100;
const OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS_MAX = 60_000;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS_DEFAULT = 3;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS_MIN = 1;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS_MAX = 5;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS_DEFAULT = 200;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS_MIN = 10;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS_MAX = 5_000;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_DEFAULT = 2;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_MIN = 1;
const OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_MAX = 5;
const COLLECTOR_IDEMPOTENCY_TTL_SECONDS_DEFAULT = 604_800;
const COLLECTOR_IDEMPOTENCY_TTL_SECONDS_MIN = 60;
const COLLECTOR_IDEMPOTENCY_TTL_SECONDS_MAX = 2_592_000;
const INTEGRATION_TARGETS_ENV = 'INTEGRATION_TARGETS';
const INTEGRATION_TARGETS_DEFAULT = 'salesforce|hubspot';
const METRICS_NAMESPACE_ENV = 'METRICS_NAMESPACE';
const METRICS_NAMESPACE_DEFAULT = 'AlertOrchestrationService/Runtime';
const STAGE_ENV = 'STAGE';
const SERVICE_NAME_ENV = 'SERVICE_NAME';
const OFFICIAL_CUSTOMERS_AUTH_SECRET_ARN_ENV = 'OFFICIAL_CUSTOMERS_AUTH_SECRET_ARN';

type PostgresQueryExecutorFactory = (credentials: CollectorSourceCredentials) => PostgresQueryExecutor;
type MySqlQueryExecutorFactory = (credentials: CollectorSourceCredentials) => MySqlQueryExecutor;

export interface CollectorEvent {
  sourceId: string;
  tenantId?: string;
  cursor?: string | number | null;
  meta?: {
    executionId?: string;
    stage?: string;
    service?: string;
    traceContext?: Partial<TelemetryTraceContext>;
  };
}

export interface CollectorResult {
  sourceId: string;
  tenantId: string;
  processedAt: string;
  recordsSent: number;
  records: CollectorStandardizedRecord[];
  schemaVersion: string;
  rejectedRecords: CanonicalCustomerRejectedRecord[];
  persistenceRejectedRecords: UpsertCustomersBatchRejectedRecord[];
  upsertAttempts: number;
  eventsPublished: number;
  deduplicatedUpsertRecords: number;
  deduplicatedEventRecords: number;
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
  upsertCustomersBatchClient: UpsertCustomersBatchClient;
  customerEventsPublisher: CustomerEventsPublisher;
  idempotencyRepository: CollectorIdempotencyRepository;
  idempotencyTtlSeconds: number;
  metricsPublisher?: RuntimeMetricsPublisher;
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

const resolveOfficialCustomersUpsertTimeoutMs = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS',
    min: OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS_MIN,
    max: OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS_MAX,
    fallback: OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS_DEFAULT,
  });

const resolveOfficialCustomersUpsertRetryMaxAttempts = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS',
    min: OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS_MIN,
    max: OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS_MAX,
    fallback: OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS_DEFAULT,
  });

const resolveOfficialCustomersUpsertRetryBaseDelayMs = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS',
    min: OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS_MIN,
    max: OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS_MAX,
    fallback: OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS_DEFAULT,
  });

const resolveOfficialCustomersUpsertRetryBackoffRate = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_DEFAULT;
  }

  const parsed = Number.parseFloat(rawValue);
  const isValidNumber = Number.isFinite(parsed);
  const isInRange =
    parsed >= OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_MIN &&
    parsed <= OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_MAX;

  if (!isValidNumber || !isInRange) {
    throw new Error(
      `Invalid OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE="${rawValue}". Expected number between ${OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_MIN} and ${OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE_MAX}.`,
    );
  }

  return parsed;
};

const resolveCollectorIdempotencyTtlSeconds = (rawValue: string | undefined): number =>
  resolveBoundedIntegerFromEnv({
    rawValue,
    envName: 'COLLECTOR_IDEMPOTENCY_TTL_SECONDS',
    min: COLLECTOR_IDEMPOTENCY_TTL_SECONDS_MIN,
    max: COLLECTOR_IDEMPOTENCY_TTL_SECONDS_MAX,
    fallback: COLLECTOR_IDEMPOTENCY_TTL_SECONDS_DEFAULT,
  });

const resolveIntegrationTargets = (rawValue: string | undefined): string[] => {
  const normalizedRaw = rawValue?.trim() || INTEGRATION_TARGETS_DEFAULT;
  const targets = Array.from(
    new Set(
      normalizedRaw
        .split(/[,|]/)
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  );

  if (targets.length === 0) {
    throw new Error(
      `${INTEGRATION_TARGETS_ENV} must include at least one integration identifier.`,
    );
  }

  return targets;
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

const createFetchUpsertCustomersBatchHttpClient = (): UpsertCustomersBatchHttpClient => {
  return async ({ url, timeoutMs, body, headers }) => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: abortController.signal,
      });

      return {
        status: response.status,
        json: () => response.json(),
        text: () => response.text(),
      };
    } finally {
      clearTimeout(timeout);
    }
  };
};

const normalizeRecordId = (record: CollectorStandardizedRecord): string => {
  if (record.id === undefined || record.id === null) {
    return '';
  }

  return String(record.id).trim();
};

const normalizeCursorToken = (cursor: CollectorCursorValue): string => String(cursor).trim();

const buildDeduplicationKey = ({
  scope,
  sourceId,
  recordId,
  cursorToken,
}: {
  scope: CollectorIdempotencyScope;
  sourceId: string;
  recordId: string;
  cursorToken: string;
}): string => `${scope}:${sourceId}:${cursorToken}:${recordId}`;

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

  const officialCustomersUpsertUrl = process.env.OFFICIAL_CUSTOMERS_UPSERT_BATCH_URL;
  if (!officialCustomersUpsertUrl || officialCustomersUpsertUrl.trim().length === 0) {
    throw new Error('OFFICIAL_CUSTOMERS_UPSERT_BATCH_URL is required.');
  }
  const officialCustomersAuthSecretArn = process.env[OFFICIAL_CUSTOMERS_AUTH_SECRET_ARN_ENV];
  if (!officialCustomersAuthSecretArn || officialCustomersAuthSecretArn.trim().length === 0) {
    throw new Error(`${OFFICIAL_CUSTOMERS_AUTH_SECRET_ARN_ENV} is required.`);
  }

  const customerEventsTopicArn = process.env.CLIENT_EVENTS_TOPIC_ARN;
  if (!customerEventsTopicArn || customerEventsTopicArn.trim().length === 0) {
    throw new Error('CLIENT_EVENTS_TOPIC_ARN is required.');
  }

  const idempotencyTableName = process.env.IDEMPOTENCY_TABLE_NAME;
  if (!idempotencyTableName || idempotencyTableName.trim().length === 0) {
    throw new Error('IDEMPOTENCY_TABLE_NAME is required.');
  }

  const secretRepository = createSecretsManagerSecretRepository();

  cachedDefaultDependencies = {
    sourceRegistryRepository: createDynamoDbSourceRegistryRepository({ tableName }),
    cursorRepository: createDynamoDbCollectorCursorRepository({ tableName: cursorsTableName }),
    secretRepository,
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
    upsertCustomersBatchClient: createUpsertCustomersBatchClient({
      endpointUrl: officialCustomersUpsertUrl,
      timeoutMs: resolveOfficialCustomersUpsertTimeoutMs(process.env.OFFICIAL_CUSTOMERS_UPSERT_TIMEOUT_MS),
      retryPolicy: {
        maxAttempts: resolveOfficialCustomersUpsertRetryMaxAttempts(
          process.env.OFFICIAL_CUSTOMERS_UPSERT_RETRY_MAX_ATTEMPTS,
        ),
        baseDelayMs: resolveOfficialCustomersUpsertRetryBaseDelayMs(
          process.env.OFFICIAL_CUSTOMERS_UPSERT_RETRY_BASE_DELAY_MS,
        ),
        backoffRate: resolveOfficialCustomersUpsertRetryBackoffRate(
          process.env.OFFICIAL_CUSTOMERS_UPSERT_RETRY_BACKOFF_RATE,
        ),
      },
      httpClient: createFetchUpsertCustomersBatchHttpClient(),
      resolveAuthHeaders: createSecretsManagerOutboundAuthHeadersResolver({
        secretArn: officialCustomersAuthSecretArn,
        secretRepository,
      }),
      nowMs: Date.now,
      sleep,
    }),
    customerEventsPublisher: createSnsCustomerEventsPublisher({
      topicArn: customerEventsTopicArn,
      integrationTargets: resolveIntegrationTargets(process.env[INTEGRATION_TARGETS_ENV]),
    }),
    idempotencyRepository: createDynamoDbCollectorIdempotencyRepository({
      tableName: idempotencyTableName,
    }),
    idempotencyTtlSeconds: resolveCollectorIdempotencyTtlSeconds(
      process.env.COLLECTOR_IDEMPOTENCY_TTL_SECONDS,
    ),
    metricsPublisher: createCloudWatchMetricsPublisher({
      namespace: process.env[METRICS_NAMESPACE_ENV] ?? METRICS_NAMESPACE_DEFAULT,
      stage: process.env[STAGE_ENV] ?? 'unknown',
      serviceName: process.env[SERVICE_NAME_ENV] ?? 'alert-orchestration-service',
    }),
    logger: createStructuredLogger({
      component: 'collector',
    }),
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
    upsertCustomersBatchClient,
    customerEventsPublisher,
    idempotencyRepository,
    idempotencyTtlSeconds,
    metricsPublisher = createNoopMetricsPublisher(),
    logger,
  }: CollectorDependencies) =>
  async (event: CollectorEvent): Promise<CollectorResult> => {
    const executionStartedAtMs = nowMs();
    const sourceId = event?.sourceId?.trim() ?? '';
    const executionId = event?.meta?.executionId?.trim();
    const stage = event?.meta?.stage ?? process.env.STAGE;
    const service = event?.meta?.service ?? process.env.SERVICE_NAME;

    return withTelemetrySpan({
      component: 'collector',
      spanName: 'collector.execute',
      parentTraceContext: event?.meta?.traceContext,
      attributes: buildTelemetryAttributes({
        service,
        stage,
        sourceId: sourceId || undefined,
        tenantId: event.tenantId,
        executionId,
      }),
      run: async ({ span, traceContext, runInChildSpan }): Promise<CollectorResult> => {
        logger.info('collector.telemetry.trace_context', {
          sourceId: sourceId || null,
          executionId: executionId ?? null,
          ...toTelemetryLogContext(traceContext),
        });

        if (sourceId.length === 0) {
          throw new Error('sourceId is required for collector execution.');
        }
        span.setAttribute('sourceId', sourceId);

        let resolvedTenantId = event.tenantId?.trim() || 'unknown';
        let executionStatus: 'SUCCEEDED' | 'FAILED' = 'FAILED';

        try {
          const sourceConfiguration = await runInChildSpan(
            {
              spanName: 'collector.load_source_configuration',
              attributes: buildTelemetryAttributes({
                service,
                stage,
                sourceId,
                tenantId: event.tenantId,
                executionId,
              }),
            },
            async () =>
              loadCollectorSourceConfiguration({
                sourceId,
                sourceRegistryRepository,
              }),
          );
          const eventTenantId = event.tenantId?.trim();
          if (eventTenantId && eventTenantId !== sourceConfiguration.tenantId) {
            throw new Error(
              `Collector tenant mismatch for source "${sourceId}": expected "${sourceConfiguration.tenantId}" but received "${eventTenantId}".`,
            );
          }
          const tenantId = eventTenantId || sourceConfiguration.tenantId;
          resolvedTenantId = tenantId;
          span.setAttribute('tenantId', tenantId);

          const cursorSnapshot = await runInChildSpan(
            {
              spanName: 'collector.load_cursor_snapshot',
              attributes: buildTelemetryAttributes({
                service,
                stage,
                sourceId,
                tenantId,
                executionId,
              }),
            },
            async () => cursorRepository.getBySource(sourceId),
          );
          logger.info('collector.cursor.loaded', {
            sourceId,
            tenantId,
            hasPersistedCursor: cursorSnapshot !== null,
            persistedCursor: cursorSnapshot?.last ?? null,
          });

          const loadedCredentials = await runInChildSpan(
            {
              spanName: 'collector.load_source_credentials',
              attributes: buildTelemetryAttributes({
                service,
                stage,
                sourceId,
                tenantId,
                executionId,
              }),
            },
            async () =>
              loadCollectorSourceCredentials({
                sourceId,
                engine: sourceConfiguration.engine,
                secretArn: sourceConfiguration.secretArn,
                secretRepository,
                retryPolicy: secretRetryPolicy,
                nowMs,
                sleep,
              }),
          );

          logger.info('collector.source_credentials.loaded', {
            sourceId,
            tenantId,
            engine: sourceConfiguration.engine,
            attempts: loadedCredentials.metrics.attempts,
            durationMs: loadedCredentials.metrics.durationMs,
          });

          const cursor = resolveCursorValue(event?.cursor, cursorSnapshot?.last, defaultCursorValue);

          let records: CollectorStandardizedRecord[];
          switch (sourceConfiguration.engine) {
            case 'postgres':
              records = await runInChildSpan(
                {
                  spanName: 'collector.collect_postgres_records',
                  attributes: buildTelemetryAttributes({
                    service,
                    stage,
                    sourceId,
                    tenantId,
                    executionId,
                  }),
                },
                async () =>
                  collectPostgresRecords({
                    sourceId,
                    queryTemplate: sourceConfiguration.query,
                    cursor,
                    postgresQueryExecutor: postgresQueryExecutorFactory(loadedCredentials.credentials),
                  }),
              );
              break;
            case 'mysql':
              records = await runInChildSpan(
                {
                  spanName: 'collector.collect_mysql_records',
                  attributes: buildTelemetryAttributes({
                    service,
                    stage,
                    sourceId,
                    tenantId,
                    executionId,
                  }),
                },
                async () =>
                  collectMySqlRecords({
                    sourceId,
                    queryTemplate: sourceConfiguration.query,
                    cursor,
                    mySqlQueryExecutor: mySqlQueryExecutorFactory(loadedCredentials.credentials),
                  }),
              );
              break;
            default:
              throw new Error(
                `Collector engine "${String(sourceConfiguration.engine)}" is not supported yet.`,
              );
          }

          logger.info('collector.source_records.collected', {
            sourceId,
            tenantId,
            engine: sourceConfiguration.engine,
            cursor,
            recordsCollected: records.length,
          });

          const requiredCanonicalFields = sourceConfiguration.fieldMap.id ? ['id'] : [];
          const mappingResult = mapRecordsWithFieldMap({
            sourceId,
            records,
            fieldMap: sourceConfiguration.fieldMap,
            requiredCanonicalFields,
          });

          const ignoredSourceColumns = mappingResult.ignoredSourceColumns.filter(
            (sourceColumn) => sourceColumn !== sourceConfiguration.cursorField,
          );
          if (ignoredSourceColumns.length > 0) {
            logger.info('collector.field_map.ignored_source_columns', {
              sourceId,
              ignoredColumns: ignoredSourceColumns,
              ignoredColumnsCount: ignoredSourceColumns.length,
            });
          }

          const canonicalValidationResult = validateCanonicalCustomerBatch(mappingResult.records);
          if (canonicalValidationResult.rejectedRecords.length > 0) {
            logger.info('collector.canonical_validation.rejected_records', {
              sourceId,
              schemaVersion: canonicalValidationResult.schemaVersion,
              rejectedRecordsCount: canonicalValidationResult.rejectedRecords.length,
              rejectedIssues: canonicalValidationResult.rejectedRecords.map((rejectedRecord) => ({
                index: rejectedRecord.index,
                issues: rejectedRecord.issues,
              })),
            });
          }

          const correlationId =
            executionId ?? `${sourceId}-${event?.meta?.stage ?? 'unknown'}-${sourceConfiguration.cursorField}`;

          const cursorToken = normalizeCursorToken(cursor);
          const claimCreatedAt = now();
          const claimExpiration = Math.floor(nowMs() / 1000) + idempotencyTtlSeconds;

          const nonDuplicatedUpsertRecords: CollectorStandardizedRecord[] = [];
          const duplicatedUpsertRecords: CollectorStandardizedRecord[] = [];
          for (const record of canonicalValidationResult.validRecords) {
            const recordId = normalizeRecordId(record);
            if (recordId.length === 0) {
              duplicatedUpsertRecords.push(record);
              continue;
            }

            const claimed = await idempotencyRepository.tryClaim({
              deduplicationKey: buildDeduplicationKey({
                scope: 'upsert',
                sourceId,
                recordId,
                cursorToken,
              }),
              scope: 'upsert',
              status: 'PENDING',
              sourceId,
              recordId,
              cursor: cursorToken,
              correlationId,
              createdAt: claimCreatedAt,
              expiresAtEpochSeconds: claimExpiration,
            });

            if (claimed) {
              nonDuplicatedUpsertRecords.push(record);
            } else {
              duplicatedUpsertRecords.push(record);
            }
          }
          if (duplicatedUpsertRecords.length > 0) {
            logger.info('collector.idempotency.upsert_deduplicated', {
              sourceId,
              correlationId,
              deduplicatedCount: duplicatedUpsertRecords.length,
            });
            logger.info('collector.idempotency.metric', {
              _aws: {
                Timestamp: nowMs(),
                CloudWatchMetrics: [
                  {
                    Namespace: 'AlertOrchestrationService/Collector',
                    Dimensions: [['Stage', 'Scope']],
                    Metrics: [{ Name: 'DeduplicatedRecords', Unit: 'Count' }],
                  },
                ],
              },
              Stage: event?.meta?.stage ?? process.env.STAGE ?? 'unknown',
              Scope: 'upsert',
              DeduplicatedRecords: duplicatedUpsertRecords.length,
            });
          }
          if (nonDuplicatedUpsertRecords.length > 0) {
            logger.info('collector.idempotency.upsert_pending_claimed', {
              sourceId,
              correlationId,
              pendingCount: nonDuplicatedUpsertRecords.length,
            });
          }

          const upsertResult = await runInChildSpan(
            {
              spanName: 'collector.upsert_customers_batch',
              attributes: buildTelemetryAttributes({
                service,
                stage,
                sourceId,
                tenantId,
                executionId,
              }),
            },
            async () =>
              upsertCustomersBatchClient({
                sourceId,
                tenantId,
                correlationId,
                records: nonDuplicatedUpsertRecords,
              }),
          );
          if (upsertResult.rejectedRecords.length > 0) {
            logger.info('collector.official_api.partial_rejection', {
              sourceId,
              correlationId,
              rejectedRecordsCount: upsertResult.rejectedRecords.length,
              attempts: upsertResult.attempts,
            });
          }

          const processedAt = now();
          let completedUpsertClaims = 0;
          for (const record of upsertResult.persistedRecords) {
            const recordId = normalizeRecordId(record);
            if (recordId.length === 0) {
              continue;
            }

            await idempotencyRepository.markCompleted({
              deduplicationKey: buildDeduplicationKey({
                scope: 'upsert',
                sourceId,
                recordId,
                cursorToken,
              }),
              completedAt: processedAt,
              expiresAtEpochSeconds: claimExpiration,
            });
            completedUpsertClaims += 1;
          }
          if (completedUpsertClaims > 0) {
            logger.info('collector.idempotency.upsert_completed', {
              sourceId,
              correlationId,
              completedCount: completedUpsertClaims,
            });
          }

          const eventCandidatesByRecordId = new Map<string, CollectorStandardizedRecord>();
          for (const record of upsertResult.persistedRecords) {
            const recordId = normalizeRecordId(record);
            if (recordId.length === 0) {
              continue;
            }

            eventCandidatesByRecordId.set(recordId, record);
          }
          for (const record of duplicatedUpsertRecords) {
            const recordId = normalizeRecordId(record);
            if (recordId.length === 0) {
              continue;
            }

            eventCandidatesByRecordId.set(recordId, record);
          }
          const eventCandidateRecords = Array.from(eventCandidatesByRecordId.values());

          const nonDuplicatedEventRecords: CollectorStandardizedRecord[] = [];
          const duplicatedEventRecords: CollectorStandardizedRecord[] = [];
          for (const record of eventCandidateRecords) {
            const recordId = normalizeRecordId(record);
            if (recordId.length === 0) {
              duplicatedEventRecords.push(record);
              continue;
            }

            const claimed = await idempotencyRepository.tryClaim({
              deduplicationKey: buildDeduplicationKey({
                scope: 'event',
                sourceId,
                recordId,
                cursorToken,
              }),
              scope: 'event',
              status: 'PENDING',
              sourceId,
              recordId,
              cursor: cursorToken,
              correlationId,
              createdAt: claimCreatedAt,
              expiresAtEpochSeconds: claimExpiration,
            });

            if (claimed) {
              nonDuplicatedEventRecords.push(record);
            } else {
              duplicatedEventRecords.push(record);
            }
          }
          if (duplicatedEventRecords.length > 0) {
            logger.info('collector.idempotency.event_deduplicated', {
              sourceId,
              correlationId,
              deduplicatedCount: duplicatedEventRecords.length,
            });
            logger.info('collector.idempotency.metric', {
              _aws: {
                Timestamp: nowMs(),
                CloudWatchMetrics: [
                  {
                    Namespace: 'AlertOrchestrationService/Collector',
                    Dimensions: [['Stage', 'Scope']],
                    Metrics: [{ Name: 'DeduplicatedRecords', Unit: 'Count' }],
                  },
                ],
              },
              Stage: event?.meta?.stage ?? process.env.STAGE ?? 'unknown',
              Scope: 'event',
              DeduplicatedRecords: duplicatedEventRecords.length,
            });
          }

          if (nonDuplicatedEventRecords.length > 0) {
            logger.info('collector.idempotency.event_pending_claimed', {
              sourceId,
              correlationId,
              pendingCount: nonDuplicatedEventRecords.length,
            });
          }

          let publishedEventsCount = 0;
          let completedEventClaims = 0;
          await runInChildSpan(
            {
              spanName: 'collector.publish_customer_events',
              attributes: buildTelemetryAttributes({
                service,
                stage,
                sourceId,
                tenantId,
                executionId,
              }),
            },
            async () => {
              for (const record of nonDuplicatedEventRecords) {
                await customerEventsPublisher({
                  sourceId,
                  tenantId,
                  correlationId,
                  records: [record],
                  publishedAt: processedAt,
                });

                publishedEventsCount += 1;
                const recordId = normalizeRecordId(record);
                if (recordId.length === 0) {
                  continue;
                }

                await idempotencyRepository.markCompleted({
                  deduplicationKey: buildDeduplicationKey({
                    scope: 'event',
                    sourceId,
                    recordId,
                    cursorToken,
                  }),
                  completedAt: processedAt,
                  expiresAtEpochSeconds: claimExpiration,
                });
                completedEventClaims += 1;
              }
            },
          );
          if (publishedEventsCount > 0) {
            logger.info('collector.sns.events_published', {
              sourceId,
              correlationId,
              publishedCount: publishedEventsCount,
            });
          }
          if (completedEventClaims > 0) {
            logger.info('collector.idempotency.event_completed', {
              sourceId,
              correlationId,
              completedCount: completedEventClaims,
            });
          }

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
            await runInChildSpan(
              {
                spanName: 'collector.persist_cursor',
                attributes: buildTelemetryAttributes({
                  service,
                  stage,
                  sourceId,
                  tenantId,
                  executionId,
                }),
              },
              async () =>
                persistCollectorCursor({
                  sourceId,
                  candidateCursor,
                  initialSnapshot: cursorSnapshot,
                  cursorRepository,
                  updatedAt: processedAt,
                  logger,
                }),
            );
          }

          const result: CollectorResult = {
            sourceId,
            tenantId,
            processedAt,
            recordsSent: upsertResult.persistedRecords.length,
            records: upsertResult.persistedRecords,
            schemaVersion: canonicalValidationResult.schemaVersion,
            rejectedRecords: canonicalValidationResult.rejectedRecords,
            persistenceRejectedRecords: upsertResult.rejectedRecords,
            upsertAttempts: upsertResult.attempts,
            eventsPublished: publishedEventsCount,
            deduplicatedUpsertRecords: duplicatedUpsertRecords.length,
            deduplicatedEventRecords: duplicatedEventRecords.length,
          };

          await runInChildSpan(
            {
              spanName: 'collector.publish_metrics',
              attributes: buildTelemetryAttributes({
                service,
                stage,
                sourceId,
                tenantId,
                executionId,
              }),
            },
            async () =>
              metricsPublisher.publish([
                {
                  name: 'CollectorRecordsCollected',
                  value: records.length,
                  unit: 'Count',
                  dimensions: {
                    SourceId: sourceId,
                    TenantId: tenantId,
                  },
                },
                {
                  name: 'CollectorRecordsPersisted',
                  value: result.recordsSent,
                  unit: 'Count',
                  dimensions: {
                    SourceId: sourceId,
                    TenantId: tenantId,
                  },
                },
                {
                  name: 'CollectorRecordsRejected',
                  value: result.rejectedRecords.length + result.persistenceRejectedRecords.length,
                  unit: 'Count',
                  dimensions: {
                    SourceId: sourceId,
                    TenantId: tenantId,
                  },
                },
              ]),
          );

          executionStatus = 'SUCCEEDED';
          return result;
        } finally {
          await runInChildSpan(
            {
              spanName: 'collector.publish_execution_metrics',
              attributes: buildTelemetryAttributes({
                service,
                stage,
                sourceId,
                tenantId: resolvedTenantId,
                executionId,
              }),
            },
            async () =>
              metricsPublisher.publish([
                {
                  name: executionStatus === 'SUCCEEDED'
                    ? 'CollectorExecutionSuccess'
                    : 'CollectorExecutionFailure',
                  value: 1,
                  unit: 'Count',
                  dimensions: {
                    SourceId: sourceId,
                    TenantId: resolvedTenantId,
                  },
                },
                {
                  name: 'CollectorExecutionLatencyMs',
                  value: nowMs() - executionStartedAtMs,
                  unit: 'Milliseconds',
                  dimensions: {
                    SourceId: sourceId,
                    TenantId: resolvedTenantId,
                  },
                },
              ]),
          );
        }
      },
    });
  };

export async function handler(event: CollectorEvent): Promise<CollectorResult> {
  return createHandler(getDefaultDependencies())(event);
}
