import { Pool } from 'pg';

import type { CollectorSourceCredentials } from '../../domain/collector/load-source-credentials';
import type { PostgresQueryExecutor } from '../../domain/collector/collect-postgres-records';

const DEFAULT_POOL_MAX_CONNECTIONS = 5;
const MIN_POOL_MAX_CONNECTIONS = 1;
const MAX_POOL_MAX_CONNECTIONS = 20;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 10_000;
const MIN_POOL_IDLE_TIMEOUT_MS = 100;
const MAX_POOL_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 5_000;
const MIN_POOL_CONNECTION_TIMEOUT_MS = 100;
const MAX_POOL_CONNECTION_TIMEOUT_MS = 60_000;

export interface PostgresPoolSettings {
  maxConnections: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export interface CreatePostgresQueryExecutorFactoryParams {
  poolSettings?: Partial<PostgresPoolSettings>;
}

type ResolvedPostgresPoolSettings = Readonly<PostgresPoolSettings>;

const poolByConnectionKey = new Map<string, Pool>();

const toIntegerInRange = (
  value: unknown,
  fieldName: string,
  min: number,
  max: number,
  fallback: number,
): number => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer between ${min} and ${max}.`);
  }

  const parsed = value as number;
  if (parsed < min || parsed > max) {
    throw new Error(`${fieldName} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
};

const resolvePoolSettings = (
  settings?: Partial<PostgresPoolSettings>,
): ResolvedPostgresPoolSettings => ({
  maxConnections: toIntegerInRange(
    settings?.maxConnections,
    'poolSettings.maxConnections',
    MIN_POOL_MAX_CONNECTIONS,
    MAX_POOL_MAX_CONNECTIONS,
    DEFAULT_POOL_MAX_CONNECTIONS,
  ),
  idleTimeoutMs: toIntegerInRange(
    settings?.idleTimeoutMs,
    'poolSettings.idleTimeoutMs',
    MIN_POOL_IDLE_TIMEOUT_MS,
    MAX_POOL_IDLE_TIMEOUT_MS,
    DEFAULT_POOL_IDLE_TIMEOUT_MS,
  ),
  connectionTimeoutMs: toIntegerInRange(
    settings?.connectionTimeoutMs,
    'poolSettings.connectionTimeoutMs',
    MIN_POOL_CONNECTION_TIMEOUT_MS,
    MAX_POOL_CONNECTION_TIMEOUT_MS,
    DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
  ),
});

const buildConnectionKey = (credentials: CollectorSourceCredentials): string =>
  [
    credentials.engine,
    credentials.host,
    String(credentials.port),
    credentials.database,
    credentials.username,
    credentials.password,
  ].join('|');

const getOrCreatePool = (
  credentials: CollectorSourceCredentials,
  settings: ResolvedPostgresPoolSettings,
): Pool => {
  const key = buildConnectionKey(credentials);
  const cachedPool = poolByConnectionKey.get(key);
  if (cachedPool) {
    return cachedPool;
  }

  const pool = new Pool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.username,
    password: credentials.password,
    max: settings.maxConnections,
    idleTimeoutMillis: settings.idleTimeoutMs,
    connectionTimeoutMillis: settings.connectionTimeoutMs,
    ssl: false,
  });

  poolByConnectionKey.set(key, pool);
  return pool;
};

export type PostgresQueryExecutorFactory = (
  credentials: CollectorSourceCredentials,
) => PostgresQueryExecutor;

export const createPostgresQueryExecutorFactory = ({
  poolSettings,
}: CreatePostgresQueryExecutorFactoryParams = {}): PostgresQueryExecutorFactory => {
  const resolvedPoolSettings = resolvePoolSettings(poolSettings);

  return (credentials: CollectorSourceCredentials): PostgresQueryExecutor => {
    if (credentials.engine !== 'postgres') {
      throw new Error(
        `Postgres query executor requires "postgres" engine, received "${credentials.engine}".`,
      );
    }

    return {
      query: async (sql: string, values: readonly unknown[]): Promise<readonly Record<string, unknown>[]> => {
        const pool = getOrCreatePool(credentials, resolvedPoolSettings);
        const result = await pool.query<Record<string, unknown>>(sql, [...values]);
        return result.rows;
      },
    };
  };
};

export const resetPostgresPoolsForTests = async (): Promise<void> => {
  const pools = [...poolByConnectionKey.values()];
  poolByConnectionKey.clear();
  await Promise.all(pools.map((pool) => pool.end()));
};
