import { describe, expect, it } from '@jest/globals';

import {
  CollectorSourceConfigInvalidError,
  CollectorSourceInactiveError,
  CollectorSourceNotFoundError,
  loadCollectorSourceConfiguration,
} from '../../../../src/domain/collector/load-source-configuration';
import type { SourceRegistryRecord } from '../../../../src/domain/sources/source-registry-repository';

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

describe('loadCollectorSourceConfiguration', () => {
  it('returns source configuration when source is active and valid', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([[VALID_SOURCE.sourceId, VALID_SOURCE]]),
    );

    const result = await loadCollectorSourceConfiguration({
      sourceId: ' source-acme ',
      sourceRegistryRepository: repository,
    });

    expect(result.sourceId).toBe('source-acme');
    expect(result.active).toBe(true);
    expect(repository.getByIdCalls).toEqual(['source-acme']);
  });

  it('throws when sourceId is empty', async () => {
    const repository = new SpySourceRegistryRepository(new Map());

    await expect(
      loadCollectorSourceConfiguration({
        sourceId: ' ',
        sourceRegistryRepository: repository,
      }),
    ).rejects.toThrow('sourceId is required for collector execution.');
  });

  it('throws controlled error when source does not exist', async () => {
    const repository = new SpySourceRegistryRepository(new Map());

    await expect(
      loadCollectorSourceConfiguration({
        sourceId: 'source-missing',
        sourceRegistryRepository: repository,
      }),
    ).rejects.toBeInstanceOf(CollectorSourceNotFoundError);
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

    await expect(
      loadCollectorSourceConfiguration({
        sourceId: 'source-inactive',
        sourceRegistryRepository: repository,
      }),
    ).rejects.toBeInstanceOf(CollectorSourceInactiveError);
  });

  it('throws controlled error when source config is invalid', async () => {
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

    await expect(
      loadCollectorSourceConfiguration({
        sourceId: 'source-invalid',
        sourceRegistryRepository: repository,
      }),
    ).rejects.toBeInstanceOf(CollectorSourceConfigInvalidError);
  });
});
