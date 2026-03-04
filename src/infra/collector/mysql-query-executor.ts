import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';

import type { CollectorSourceCredentials } from '../../domain/collector/load-source-credentials';
import type { MySqlQueryExecutor } from '../../domain/collector/collect-mysql-records';

const DEFAULT_POOL_MAX_CONNECTIONS = 5;
const MIN_POOL_MAX_CONNECTIONS = 1;
const MAX_POOL_MAX_CONNECTIONS = 20;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 10_000;
const MIN_POOL_IDLE_TIMEOUT_MS = 100;
const MAX_POOL_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 5_000;
const MIN_POOL_CONNECTION_TIMEOUT_MS = 100;
const MAX_POOL_CONNECTION_TIMEOUT_MS = 60_000;
const DEFAULT_QUERY_TIMEOUT_MS = 5_000;
const MIN_QUERY_TIMEOUT_MS = 100;
const MAX_QUERY_TIMEOUT_MS = 120_000;

export interface MySqlPoolSettings {
  maxConnections: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
}

export interface CreateMySqlQueryExecutorFactoryParams {
  poolSettings?: Partial<MySqlPoolSettings>;
}

type ResolvedMySqlPoolSettings = Readonly<MySqlPoolSettings>;

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
  settings?: Partial<MySqlPoolSettings>,
): ResolvedMySqlPoolSettings => ({
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
  queryTimeoutMs: toIntegerInRange(
    settings?.queryTimeoutMs,
    'poolSettings.queryTimeoutMs',
    MIN_QUERY_TIMEOUT_MS,
    MAX_QUERY_TIMEOUT_MS,
    DEFAULT_QUERY_TIMEOUT_MS,
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
  settings: ResolvedMySqlPoolSettings,
): Pool => {
  const key = buildConnectionKey(credentials);
  const cachedPool = poolByConnectionKey.get(key);
  if (cachedPool) {
    return cachedPool;
  }

  const pool = createPool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.username,
    password: credentials.password,
    waitForConnections: true,
    connectionLimit: settings.maxConnections,
    maxIdle: settings.maxConnections,
    idleTimeout: settings.idleTimeoutMs,
    queueLimit: 0,
    connectTimeout: settings.connectionTimeoutMs,
    enableKeepAlive: true,
  });

  poolByConnectionKey.set(key, pool);
  return pool;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type MySqlQueryExecutorFactory = (credentials: CollectorSourceCredentials) => MySqlQueryExecutor;

export const createMySqlQueryExecutorFactory = ({
  poolSettings,
}: CreateMySqlQueryExecutorFactoryParams = {}): MySqlQueryExecutorFactory => {
  const resolvedPoolSettings = resolvePoolSettings(poolSettings);

  return (credentials: CollectorSourceCredentials): MySqlQueryExecutor => {
    if (credentials.engine !== 'mysql') {
      throw new Error(`MySQL query executor requires "mysql" engine, received "${credentials.engine}".`);
    }

    return {
      query: async (sql: string, values: readonly unknown[]): Promise<readonly Record<string, unknown>[]> => {
        const pool = getOrCreatePool(credentials, resolvedPoolSettings);
        const [rows] = await pool.query<RowDataPacket[]>(
          { sql, timeout: resolvedPoolSettings.queryTimeoutMs },
          [...values],
        );

        if (!Array.isArray(rows)) {
          throw new Error('MySQL query must return an array of rows.');
        }

        const normalizedRows: Record<string, unknown>[] = [];
        for (const row of rows as unknown[]) {
          if (!isRecord(row)) {
            throw new Error('MySQL query returned an invalid row payload.');
          }

          normalizedRows.push({ ...row });
        }

        return normalizedRows;
      },
    };
  };
};

export const resetMySqlPoolsForTests = async (): Promise<void> => {
  const pools = [...poolByConnectionKey.values()];
  poolByConnectionKey.clear();
  await Promise.all(pools.map((pool) => pool.end()));
};
