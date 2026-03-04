import { describe, expect, it } from '@jest/globals';

import {
  CollectorSourceConfigInvalidError,
  CollectorSourceInactiveError,
  CollectorSourceNotFoundError,
} from '../../../src/domain/collector/load-source-configuration';
import {
  CollectorSecretNotFoundError,
  type CollectorSecretRetryPolicy,
} from '../../../src/domain/collector/load-source-credentials';
import type { SourceRegistryRecord } from '../../../src/domain/sources/source-registry-repository';
import { createHandler } from '../../../src/handlers/collector';

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

describe('collector handler', () => {
  it('loads source config and returns standardized result for a valid sourceId', async () => {
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
    const logger = new SpyLogger();
    let nowMsCalls = 0;
    const handler = createHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      secretRetryPolicy: DEFAULT_SECRET_RETRY_POLICY,
      now: () => '2026-03-04T11:00:00.000Z',
      nowMs: () => {
        nowMsCalls += 1;
        return nowMsCalls === 1 ? 1000 : 1030;
      },
      sleep: () => Promise.resolve(),
      logger,
    });

    const result = await handler({ sourceId: ' source-acme ' });

    expect(result.sourceId).toBe('source-acme');
    expect(result.recordsSent).toBe(0);
    expect(result.processedAt).toBe('2026-03-04T11:00:00.000Z');
    expect(repository.getByIdCalls).toEqual(['source-acme']);
    expect(secrets.getSecretValueCalls).toEqual([VALID_SOURCE.secretArn]);
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
    ]);
  });

  it('throws when sourceId is missing', async () => {
    const secrets = new SpySecretRepository(new Map());
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(new Map()),
      secretRepository: secrets,
      secretRetryPolicy: DEFAULT_SECRET_RETRY_POLICY,
      now: () => '2026-03-04T11:00:00.000Z',
      nowMs: () => 1000,
      sleep: () => Promise.resolve(),
      logger: new SpyLogger(),
    });

    await expect(handler({ sourceId: '' })).rejects.toThrow(
      'sourceId is required for collector execution.',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
  });

  it('throws controlled error when source does not exist in sources table', async () => {
    const secrets = new SpySecretRepository(new Map());
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(new Map()),
      secretRepository: secrets,
      secretRetryPolicy: DEFAULT_SECRET_RETRY_POLICY,
      now: () => '2026-03-04T11:00:00.000Z',
      nowMs: () => 1000,
      sleep: () => Promise.resolve(),
      logger: new SpyLogger(),
    });

    await expect(handler({ sourceId: 'source-missing' })).rejects.toBeInstanceOf(
      CollectorSourceNotFoundError,
    );
    await expect(handler({ sourceId: 'source-missing' })).rejects.toThrow(
      'Source "source-missing" was not found in sources registry.',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
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
    const handler = createHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      secretRetryPolicy: DEFAULT_SECRET_RETRY_POLICY,
      now: () => '2026-03-04T11:00:00.000Z',
      nowMs: () => 1000,
      sleep: () => Promise.resolve(),
      logger: new SpyLogger(),
    });

    await expect(handler({ sourceId: 'source-inactive' })).rejects.toBeInstanceOf(
      CollectorSourceInactiveError,
    );
    await expect(handler({ sourceId: 'source-inactive' })).rejects.toThrow(
      'Source "source-inactive" is inactive and cannot be collected.',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
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
    const handler = createHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      secretRetryPolicy: DEFAULT_SECRET_RETRY_POLICY,
      now: () => '2026-03-04T11:00:00.000Z',
      nowMs: () => 1000,
      sleep: () => Promise.resolve(),
      logger: new SpyLogger(),
    });

    await expect(handler({ sourceId: 'source-invalid' })).rejects.toBeInstanceOf(
      CollectorSourceConfigInvalidError,
    );
    await expect(handler({ sourceId: 'source-invalid' })).rejects.toThrow(
      'Source "source-invalid" has invalid configuration:',
    );
    expect(secrets.getSecretValueCalls).toEqual([]);
  });

  it('throws controlled error when secret does not exist in Secrets Manager', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([[VALID_SOURCE.sourceId, VALID_SOURCE]]),
    );
    const secrets = new SpySecretRepository(new Map([[VALID_SOURCE.secretArn, null]]));

    const handler = createHandler({
      sourceRegistryRepository: repository,
      secretRepository: secrets,
      secretRetryPolicy: DEFAULT_SECRET_RETRY_POLICY,
      now: () => '2026-03-04T11:00:00.000Z',
      nowMs: () => 1000,
      sleep: () => Promise.resolve(),
      logger: new SpyLogger(),
    });

    await expect(handler({ sourceId: VALID_SOURCE.sourceId })).rejects.toBeInstanceOf(
      CollectorSecretNotFoundError,
    );
    await expect(handler({ sourceId: VALID_SOURCE.sourceId })).rejects.toThrow(
      `Secret for source "${VALID_SOURCE.sourceId}" was not found in Secrets Manager.`,
    );
    expect(secrets.getSecretValueCalls).toEqual([VALID_SOURCE.secretArn, VALID_SOURCE.secretArn]);
  });
});
