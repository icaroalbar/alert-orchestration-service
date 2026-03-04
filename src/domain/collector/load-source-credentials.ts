import type { SourceEngine } from '../sources/source-schema';

const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;
const DEFAULT_RETRY_BACKOFF_RATE = 2;
const MIN_RETRY_ATTEMPTS = 1;
const MIN_RETRY_BASE_DELAY_MS = 1;
const MIN_RETRY_BACKOFF_RATE = 1;
const MAX_DATABASE_PORT = 65535;

const DEFAULT_PORT_BY_ENGINE: Record<SourceEngine, number> = {
  postgres: 5432,
  mysql: 3306,
};

const TRANSIENT_SECRET_ERROR_IDENTIFIERS = new Set([
  'ThrottlingException',
  'TooManyRequestsException',
  'InternalServiceError',
  'InternalServiceErrorException',
  'ServiceUnavailable',
  'ServiceUnavailableException',
  'RequestTimeout',
  'RequestTimeoutException',
  'TimeoutError',
  'NetworkingError',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
]);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidPort = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= MAX_DATABASE_PORT;

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const readErrorStringProperty = (
  error: unknown,
  propertyName: 'name' | 'code',
): string | undefined => {
  if (!isRecord(error) || !hasOwn(error, propertyName)) {
    return undefined;
  }

  const value = error[propertyName];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const describeError = (error: unknown): string => {
  const name = readErrorStringProperty(error, 'name');
  const code = readErrorStringProperty(error, 'code');

  if (name && code && name !== code) {
    return `${name} (${code})`;
  }

  if (name) {
    return name;
  }

  if (code) {
    return code;
  }

  return 'UnknownError';
};

const isTransientSecretError = (error: unknown): boolean => {
  const name = readErrorStringProperty(error, 'name');
  const code = readErrorStringProperty(error, 'code');

  if (name && TRANSIENT_SECRET_ERROR_IDENTIFIERS.has(name)) {
    return true;
  }

  if (code && TRANSIENT_SECRET_ERROR_IDENTIFIERS.has(code)) {
    return true;
  }

  return isRecord(error) && hasOwn(error, '$retryable');
};

const calculateRetryDelayMs = (
  retryPolicy: CollectorSecretRetryPolicy,
  failedAttempt: number,
): number => {
  const exponent = Math.max(0, failedAttempt - 1);
  const rawDelay = retryPolicy.baseDelayMs * retryPolicy.backoffRate ** exponent;
  return Math.max(1, Math.floor(rawDelay));
};

const toRecord = (sourceId: string, secretValue: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretValue);
  } catch {
    throw new CollectorSecretPayloadInvalidError(
      sourceId,
      'secret payload must be a valid JSON object.',
    );
  }

  if (!isRecord(parsed)) {
    throw new CollectorSecretPayloadInvalidError(sourceId, 'secret payload must be a JSON object.');
  }

  return parsed;
};

const readField = (payload: Record<string, unknown>, aliases: readonly string[]): unknown => {
  for (const alias of aliases) {
    if (hasOwn(payload, alias)) {
      return payload[alias];
    }
  }

  return undefined;
};

const readRequiredString = (
  payload: Record<string, unknown>,
  aliases: readonly string[],
  fieldName: string,
  sourceId: string,
): string => {
  const value = readField(payload, aliases);
  if (!isNonEmptyString(value)) {
    throw new CollectorSecretPayloadInvalidError(
      sourceId,
      `missing required string field "${fieldName}".`,
    );
  }

  return value.trim();
};

const readPort = (
  payload: Record<string, unknown>,
  engine: SourceEngine,
  sourceId: string,
): number => {
  const value = readField(payload, ['port']);
  if (value === undefined || value === null) {
    return DEFAULT_PORT_BY_ENGINE[engine];
  }

  if (typeof value === 'number' && isValidPort(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (isValidPort(parsed)) {
      return parsed;
    }
  }

  throw new CollectorSecretPayloadInvalidError(
    sourceId,
    'field "port" must be an integer between 1 and 65535.',
  );
};

const normalizeCredentials = (
  sourceId: string,
  engine: SourceEngine,
  secretValue: string,
): CollectorSourceCredentials => {
  const payload = toRecord(sourceId, secretValue);

  return {
    engine,
    host: readRequiredString(payload, ['host'], 'host', sourceId),
    port: readPort(payload, engine, sourceId),
    database: readRequiredString(payload, ['database', 'dbname', 'db'], 'database', sourceId),
    username: readRequiredString(payload, ['username', 'user'], 'username', sourceId),
    password: readRequiredString(payload, ['password', 'pass'], 'password', sourceId),
  };
};

const toPositiveInteger = (value: unknown, fieldName: string): number => {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${fieldName} must be an integer greater than zero.`);
  }

  return value as number;
};

const toBackoffRate = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_RETRY_BACKOFF_RATE) {
    throw new Error('retryPolicy.backoffRate must be a number greater than or equal to 1.');
  }

  return value;
};

const normalizeRetryPolicy = (
  retryPolicy?: Partial<CollectorSecretRetryPolicy>,
): CollectorSecretRetryPolicy => {
  if (!retryPolicy) {
    return {
      maxAttempts: DEFAULT_RETRY_MAX_ATTEMPTS,
      baseDelayMs: DEFAULT_RETRY_BASE_DELAY_MS,
      backoffRate: DEFAULT_RETRY_BACKOFF_RATE,
    };
  }

  const maxAttempts = toPositiveInteger(
    retryPolicy.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS,
    'retryPolicy.maxAttempts',
  );
  const baseDelayMs = toPositiveInteger(
    retryPolicy.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
    'retryPolicy.baseDelayMs',
  );
  const backoffRate = toBackoffRate(retryPolicy.backoffRate ?? DEFAULT_RETRY_BACKOFF_RATE);

  if (maxAttempts < MIN_RETRY_ATTEMPTS) {
    throw new Error('retryPolicy.maxAttempts must be greater than or equal to 1.');
  }

  if (baseDelayMs < MIN_RETRY_BASE_DELAY_MS) {
    throw new Error('retryPolicy.baseDelayMs must be greater than or equal to 1.');
  }

  return {
    maxAttempts,
    baseDelayMs,
    backoffRate,
  };
};

export interface CollectorSourceCredentials {
  engine: SourceEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface CollectorSecretRepository {
  getSecretValue(secretArn: string): Promise<string | null>;
}

export interface CollectorSecretRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  backoffRate: number;
}

export interface CollectorCredentialReadMetrics {
  attempts: number;
  durationMs: number;
}

export interface LoadCollectorSourceCredentialsResult {
  credentials: CollectorSourceCredentials;
  metrics: CollectorCredentialReadMetrics;
}

export class CollectorSecretNotFoundError extends Error {
  constructor(sourceId: string) {
    super(`Secret for source "${sourceId}" was not found in Secrets Manager.`);
    this.name = 'CollectorSecretNotFoundError';
  }
}

export class CollectorSecretPayloadInvalidError extends Error {
  constructor(sourceId: string, reason: string) {
    super(`Secret payload for source "${sourceId}" is invalid: ${reason}`);
    this.name = 'CollectorSecretPayloadInvalidError';
  }
}

export class CollectorSecretAccessError extends Error {
  constructor(sourceId: string, reason: string) {
    super(`Unable to load secret for source "${sourceId}" from Secrets Manager: ${reason}.`);
    this.name = 'CollectorSecretAccessError';
  }
}

export interface LoadCollectorSourceCredentialsParams {
  sourceId: string;
  engine: SourceEngine;
  secretArn: string;
  secretRepository: CollectorSecretRepository;
  retryPolicy?: Partial<CollectorSecretRetryPolicy>;
  nowMs?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}

export const loadCollectorSourceCredentials = async ({
  sourceId,
  engine,
  secretArn,
  secretRepository,
  retryPolicy,
  nowMs = Date.now,
  sleep = defaultSleep,
}: LoadCollectorSourceCredentialsParams): Promise<LoadCollectorSourceCredentialsResult> => {
  const normalizedSourceId = sourceId.trim();
  if (normalizedSourceId.length === 0) {
    throw new Error('sourceId is required for collector execution.');
  }

  const normalizedSecretArn = secretArn.trim();
  if (normalizedSecretArn.length === 0) {
    throw new Error(`secretArn is required for source "${normalizedSourceId}".`);
  }

  const resolvedRetryPolicy = normalizeRetryPolicy(retryPolicy);
  const startedAtMs = nowMs();

  for (let attempt = 1; attempt <= resolvedRetryPolicy.maxAttempts; attempt += 1) {
    try {
      const secretValue = await secretRepository.getSecretValue(normalizedSecretArn);

      if (secretValue === null) {
        throw new CollectorSecretNotFoundError(normalizedSourceId);
      }

      const credentials = normalizeCredentials(normalizedSourceId, engine, secretValue);
      const durationMs = Math.max(0, nowMs() - startedAtMs);

      return {
        credentials,
        metrics: {
          attempts: attempt,
          durationMs,
        },
      };
    } catch (error) {
      if (
        error instanceof CollectorSecretNotFoundError ||
        error instanceof CollectorSecretPayloadInvalidError
      ) {
        throw error;
      }

      const canRetry = isTransientSecretError(error) && attempt < resolvedRetryPolicy.maxAttempts;
      if (!canRetry) {
        throw new CollectorSecretAccessError(normalizedSourceId, describeError(error));
      }

      const delayMs = calculateRetryDelayMs(resolvedRetryPolicy, attempt);
      await sleep(delayMs);
    }
  }

  throw new CollectorSecretAccessError(normalizedSourceId, 'RetryAttemptsExhausted');
};
