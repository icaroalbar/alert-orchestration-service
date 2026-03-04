import {
  loadCollectorSourceCredentials,
  type CollectorSecretRepository,
  type CollectorSecretRetryPolicy,
} from '../domain/collector/load-source-credentials';
import {
  loadCollectorSourceConfiguration,
  type CollectorSourceConfigurationRepository,
} from '../domain/collector/load-source-configuration';
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

export interface CollectorEvent {
  sourceId: string;
  meta?: {
    executionId?: string;
    stage?: string;
  };
}

export interface CollectorResult {
  sourceId: string;
  processedAt: string;
  recordsSent: number;
}

export interface CollectorDependencies {
  sourceRegistryRepository: CollectorSourceConfigurationRepository;
  secretRepository: CollectorSecretRepository;
  secretRetryPolicy: CollectorSecretRetryPolicy;
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

const resolveRetryMaxAttempts = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_DEFAULT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  const isValidInteger = Number.isInteger(parsed);
  const isInRange =
    parsed >= COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MIN &&
    parsed <= COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MAX;

  if (!isValidInteger || !isInRange) {
    throw new Error(
      `Invalid COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS="${rawValue}". Expected integer between ${COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MIN} and ${COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS_MAX}.`,
    );
  }

  return parsed;
};

const resolveRetryBaseDelayMs = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_DEFAULT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  const isValidInteger = Number.isInteger(parsed);
  const isInRange =
    parsed >= COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MIN &&
    parsed <= COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MAX;

  if (!isValidInteger || !isInRange) {
    throw new Error(
      `Invalid COLLECTOR_SECRET_RETRY_BASE_DELAY_MS="${rawValue}". Expected integer between ${COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MIN} and ${COLLECTOR_SECRET_RETRY_BASE_DELAY_MS_MAX}.`,
    );
  }

  return parsed;
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
    secretRetryPolicy: {
      maxAttempts: resolveRetryMaxAttempts(process.env.COLLECTOR_SECRET_RETRY_MAX_ATTEMPTS),
      baseDelayMs: resolveRetryBaseDelayMs(process.env.COLLECTOR_SECRET_RETRY_BASE_DELAY_MS),
      backoffRate: resolveRetryBackoffRate(process.env.COLLECTOR_SECRET_RETRY_BACKOFF_RATE),
    },
    now: nowIso,
    nowMs: Date.now,
    sleep,
    logger: console,
  };

  return cachedDefaultDependencies;
};

export const createHandler =
  ({ sourceRegistryRepository, secretRepository, secretRetryPolicy, now, nowMs, sleep, logger }: CollectorDependencies) =>
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

    return {
      sourceId,
      processedAt: now(),
      recordsSent: 0,
    };
  };

export async function handler(event: CollectorEvent): Promise<CollectorResult> {
  return createHandler(getDefaultDependencies())(event);
}
