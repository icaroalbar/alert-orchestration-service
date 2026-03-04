import { describe, expect, it } from '@jest/globals';

import type { MySqlQueryExecutor } from '../../../src/domain/collector/collect-mysql-records';
import type { PostgresQueryExecutor } from '../../../src/domain/collector/collect-postgres-records';
import {
  CollectorSourceConfigInvalidError,
  CollectorSourceInactiveError,
  CollectorSourceNotFoundError,
} from '../../../src/domain/collector/load-source-configuration';
import {
  CollectorSecretNotFoundError,
  type CollectorSecretRetryPolicy,
  type CollectorSourceCredentials,
} from '../../../src/domain/collector/load-source-credentials';
import type { SourceRegistryRecord } from '../../../src/domain/sources/source-registry-repository';
import { createHandler, type CollectorDependencies } from '../../../src/handlers/collector';

const VALID_SOURCE: SourceRegistryRecord = {
  sourceId: 'source-acme',
  active: true,
  engine: 'postgres',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:acme/source-db',
  query: 'select * from customers where updated_at > {{cursor}}',
  cursorField: 'updated_at',
  fieldMap: {
    id: 'customer_id',
    email: 'email',
  },
  scheduleType: 'interval',
  intervalMinutes: 30,
  nextRunAt: '2026-03-04T10:30:00.000Z',
  schemaVersion: '1.0.0',
  createdAt: '2026-03-04T10:00:00.000Z',
  updatedAt: '2026-03-04T10:00:00.000Z',
};

const VALID_MYSQL_SOURCE: SourceRegistryRecord = {
  ...VALID_SOURCE,
  sourceId: 'source-mysql',
  engine: 'mysql',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:acme/source-mysql',
};

class SpySourceRegistryRepository {
  public readonly getByIdCalls: string[] = [];

  constructor(private readonly storage: Map<string, SourceRegistryRecord>) {}

  getById(sourceId: string): Promise<SourceRegistryRecord | null> {
    this.getByIdCalls.push(sourceId);
    return Promise.resolve(this.storage.get(sourceId) ?? null);
  }
}

class SpySecretRepository {
  public readonly getSecretValueCalls: string[] = [];

  constructor(private readonly secretByArn: Map<string, string | null>) {}

  getSecretValue(secretArn: string): Promise<string | null> {
    this.getSecretValueCalls.push(secretArn);
    return Promise.resolve(this.secretByArn.get(secretArn) ?? null);
  }
}

class SpyPostgresQueryExecutorFactory {
  public readonly createCalls: CollectorSourceCredentials[] = [];
  public readonly queryCalls: Array<{ sql: string; values: readonly unknown[] }> = [];

  constructor(private readonly rowsToReturn: readonly Record<string, unknown>[]) {}

  create = (credentials: CollectorSourceCredentials): PostgresQueryExecutor => {
    this.createCalls.push(credentials);

    return {
      query: (sql: string, values: readonly unknown[]) => {
        this.queryCalls.push({ sql, values });
        return Promise.resolve(this.rowsToReturn);
      },
    };
  };
}

class SpyMySqlQueryExecutorFactory {
  public readonly createCalls: CollectorSourceCredentials[] = [];
  public readonly queryCalls: Array<{ sql: string; values: readonly unknown[] }> = [];

  constructor(private readonly rowsToReturn: readonly Record<string, unknown>[]) {}

  create = (credentials: CollectorSourceCredentials): MySqlQueryExecutor => {
    this.createCalls.push(credentials);

    return {
      query: (sql: string, values: readonly unknown[]) => {
        this.queryCalls.push({ sql, values });
        return Promise.resolve(this.rowsToReturn);
      },
    };
  };
}

class SpyLogger {
  public readonly infoCalls: unknown[][] = [];

  info(...args: unknown[]): void {
    this.infoCalls.push(args);
  }
}

const DEFAULT_SECRET_RETRY_POLICY: CollectorSecretRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 10,
  backoffRate: 2,
};

const createCollectorHandler = ({
  sourceRegistryRepository,
  secretRepository,
  postgresQueryExecutorFactory,
  mySqlQueryExecutorFactory = new SpyMySqlQueryExecutorFactory([]),
  logger,
}: {
  sourceRegistryRepository: SpySourceRegistryRepository;
  secretRepository: SpySecretRepository;
  postgresQueryExecutorFactory: SpyPostgresQueryExecutorFactory;
  mySqlQueryExecutorFactory?: SpyMySqlQueryExecutorFactory;
  logger?: SpyLogger;
}) => {
  let nowMsCalls = 0;
  const dependencies: CollectorDependencies = {
    sourceRegistryRepository,
    secretRepository,
    postgresQueryExecutorFactory: postgresQueryExecutorFactory.create,
    mySqlQueryExecutorFactory: mySqlQueryExecutorFactory.create,
    secretRetryPolicy: DEFAULT_SECRET_RETRY_POLICY,
    defaultCursorValue: '2026-03-01T00:00:00.000Z',
    now: () => '2026-03-04T11:00:00.000Z',
    nowMs: () => {
      nowMsCalls += 1;
      return nowMsCalls === 1 ? 1000 : 1030;
    },
    sleep: () => Promise.resolve(),
    logger: logger ?? new SpyLogger(),
  };

  return createHandler(dependencies);
};

describe('collector handler', () => {
  it('loads source config, runs postgres incremental query and returns standardized result', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([[VALID_SOURCE.sourceId, VALID_SOURCE]]),
    );
    const secrets = new SpySecretRepository(
      new Map<string, string | null>([
        [
          VALID_SOURCE.secretArn,
          JSON.stringify({
            host: 'db.internal',
            port: 5432,
            database: 'crm',
            username: 'collector_user',
            password: 'collector_password',
          }),
        ],
      ]),
    );
    const postgresFactory = new SpyPostgresQueryExecutorFactory([
      {
        customer_id: 10,
        email: 'first@example.com',
        updated_at: new Date('2026-03-04T10:10:00.000Z'),
      },
      {
        customer_id: 11,
        email: 'second@example.com',
        updated_at: new Date('2026-03-04T10:20:00.000Z'),
      },
    ]);
    const logger = new SpyLogger();

    const handler = createCollectorHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
      logger,
    });

    const result = await handler({ sourceId: ' source-acme ' });

    expect(result.sourceId).toBe('source-acme');
    expect(result.processedAt).toBe('2026-03-04T11:00:00.000Z');
    expect(result.recordsSent).toBe(2);
    expect(result.records).toEqual([
      {
        customer_id: 10,
        email: 'first@example.com',
        updated_at: '2026-03-04T10:10:00.000Z',
      },
      {
        customer_id: 11,
        email: 'second@example.com',
        updated_at: '2026-03-04T10:20:00.000Z',
      },
    ]);

    expect(repository.getByIdCalls).toEqual(['source-acme']);
    expect(secrets.getSecretValueCalls).toEqual([VALID_SOURCE.secretArn]);
    expect(postgresFactory.createCalls).toHaveLength(1);
    expect(postgresFactory.queryCalls).toEqual([
      {
        sql: 'select * from customers where updated_at > $1',
        values: ['2026-03-01T00:00:00.000Z'],
      },
    ]);
    expect(logger.infoCalls).toEqual([
      [
        'collector.source_credentials.loaded',
        {
          sourceId: 'source-acme',
          engine: 'postgres',
          attempts: 1,
          durationMs: 30,
        },
      ],
      [
        'collector.source_records.collected',
        {
          sourceId: 'source-acme',
          engine: 'postgres',
          cursor: '2026-03-01T00:00:00.000Z',
          recordsCollected: 2,
        },
      ],
    ]);
  });

  it('loads source config, runs mysql incremental query and returns standardized result', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([[VALID_MYSQL_SOURCE.sourceId, VALID_MYSQL_SOURCE]]),
    );
    const secrets = new SpySecretRepository(
      new Map<string, string | null>([
        [
          VALID_MYSQL_SOURCE.secretArn,
          JSON.stringify({
            host: 'mysql.internal',
            port: 3306,
            database: 'crm',
            username: 'collector_user',
            password: 'collector_password',
          }),
        ],
      ]),
    );
    const postgresFactory = new SpyPostgresQueryExecutorFactory([]);
    const mySqlFactory = new SpyMySqlQueryExecutorFactory([
      {
        customer_id: 99,
        email: 'mysql@example.com',
        updated_at: new Date('2026-03-04T10:25:00.000Z'),
      },
    ]);

    const handler = createCollectorHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
      mySqlQueryExecutorFactory: mySqlFactory,
    });

    const result = await handler({ sourceId: VALID_MYSQL_SOURCE.sourceId, cursor: 42 });

    expect(result.recordsSent).toBe(1);
    expect(result.records).toEqual([
      {
        customer_id: 99,
        email: 'mysql@example.com',
        updated_at: '2026-03-04T10:25:00.000Z',
      },
    ]);
    expect(postgresFactory.createCalls).toEqual([]);
    expect(mySqlFactory.createCalls).toHaveLength(1);
    expect(mySqlFactory.queryCalls).toEqual([
      {
        sql: 'select * from customers where updated_at > ?',
        values: [42],
      },
    ]);
  });

  it('uses event cursor override when provided', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([[VALID_SOURCE.sourceId, VALID_SOURCE]]),
    );
    const secrets = new SpySecretRepository(
      new Map<string, string | null>([
        [
          VALID_SOURCE.secretArn,
          JSON.stringify({
            host: 'db.internal',
            port: 5432,
            database: 'crm',
            username: 'collector_user',
            password: 'collector_password',
          }),
        ],
      ]),
    );
    const postgresFactory = new SpyPostgresQueryExecutorFactory([]);
    const handler = createCollectorHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
    });

    await handler({
      sourceId: VALID_SOURCE.sourceId,
      cursor: '2026-03-04T09:00:00.000Z',
    });

    expect(postgresFactory.queryCalls).toEqual([
      {
        sql: 'select * from customers where updated_at > $1',
        values: ['2026-03-04T09:00:00.000Z'],
      },
    ]);
  });

  it('throws when sourceId is missing', async () => {
    const secrets = new SpySecretRepository(new Map());
    const postgresFactory = new SpyPostgresQueryExecutorFactory([]);
    const handler = createCollectorHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(new Map()),
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
    });

    await expect(handler({ sourceId: '' })).rejects.toThrow(
      'sourceId is required for collector execution.',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
    expect(postgresFactory.queryCalls).toEqual([]);
  });

  it('throws controlled error when source does not exist in sources table', async () => {
    const secrets = new SpySecretRepository(new Map());
    const postgresFactory = new SpyPostgresQueryExecutorFactory([]);
    const handler = createCollectorHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(new Map()),
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
    });

    await expect(handler({ sourceId: 'source-missing' })).rejects.toBeInstanceOf(
      CollectorSourceNotFoundError,
    );
    await expect(handler({ sourceId: 'source-missing' })).rejects.toThrow(
      'Source "source-missing" was not found in sources registry.',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
    expect(postgresFactory.queryCalls).toEqual([]);
  });

  it('throws controlled error when source is inactive', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([
        [
          'source-inactive',
          {
            ...VALID_SOURCE,
            sourceId: 'source-inactive',
            active: false,
          },
        ],
      ]),
    );
    const secrets = new SpySecretRepository(new Map());
    const postgresFactory = new SpyPostgresQueryExecutorFactory([]);
    const handler = createCollectorHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
    });

    await expect(handler({ sourceId: 'source-inactive' })).rejects.toBeInstanceOf(
      CollectorSourceInactiveError,
    );
    await expect(handler({ sourceId: 'source-inactive' })).rejects.toThrow(
      'Source "source-inactive" is inactive and cannot be collected.',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
    expect(postgresFactory.queryCalls).toEqual([]);
  });

  it('throws controlled error when source has invalid required fields', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([
        [
          'source-invalid',
          {
            ...VALID_SOURCE,
            sourceId: 'source-invalid',
            query: 'select * from customers',
          },
        ],
      ]),
    );
    const secrets = new SpySecretRepository(new Map());
    const postgresFactory = new SpyPostgresQueryExecutorFactory([]);
    const handler = createCollectorHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
    });

    await expect(handler({ sourceId: 'source-invalid' })).rejects.toBeInstanceOf(
      CollectorSourceConfigInvalidError,
    );
    await expect(handler({ sourceId: 'source-invalid' })).rejects.toThrow(
      'Source "source-invalid" has invalid configuration:',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
    expect(postgresFactory.queryCalls).toEqual([]);
  });

  it('throws controlled error when secret does not exist in Secrets Manager', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([[VALID_SOURCE.sourceId, VALID_SOURCE]]),
    );
    const secrets = new SpySecretRepository(new Map([[VALID_SOURCE.secretArn, null]]));
    const postgresFactory = new SpyPostgresQueryExecutorFactory([]);
    const handler = createCollectorHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      postgresQueryExecutorFactory: postgresFactory,
    });

    await expect(handler({ sourceId: VALID_SOURCE.sourceId })).rejects.toBeInstanceOf(
      CollectorSecretNotFoundError,
    );
    await expect(handler({ sourceId: VALID_SOURCE.sourceId })).rejects.toThrow(
      `Secret for source "${VALID_SOURCE.sourceId}" was not found in Secrets Manager.`,
    );
    expect(secrets.getSecretValueCalls).toEqual([VALID_SOURCE.secretArn, VALID_SOURCE.secretArn]);
    expect(postgresFactory.queryCalls).toEqual([]);
  });
});
