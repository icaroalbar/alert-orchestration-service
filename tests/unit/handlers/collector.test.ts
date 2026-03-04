import { describe, expect, it } from '@jest/globals';

import {
  CollectorSourceConfigInvalidError,
  CollectorSourceInactiveError,
  CollectorSourceNotFoundError,
} from '../../../src/domain/collector/load-source-configuration';
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

describe('collector handler', () => {
  it('loads source config and returns standardized result for a valid sourceId', async () => {
    const repository = new SpySourceRegistryRepository(
      new Map<string, SourceRegistryRecord>([[VALID_SOURCE.sourceId, VALID_SOURCE]]),
    );
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-04T11:00:00.000Z',
    });

    const result = await handler({ sourceId: ' source-acme ' });

    expect(result.sourceId).toBe('source-acme');
    expect(result.recordsSent).toBe(0);
    expect(result.processedAt).toBe('2026-03-04T11:00:00.000Z');
    expect(repository.getByIdCalls).toEqual(['source-acme']);
  });

  it('throws when sourceId is missing', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(new Map()),
      now: () => '2026-03-04T11:00:00.000Z',
    });

    await expect(handler({ sourceId: '' })).rejects.toThrow(
      'sourceId is required for collector execution.',
    );
  });

  it('throws controlled error when source does not exist in sources table', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(new Map()),
      now: () => '2026-03-04T11:00:00.000Z',
    });

    await expect(handler({ sourceId: 'source-missing' })).rejects.toBeInstanceOf(
      CollectorSourceNotFoundError,
    );
    await expect(handler({ sourceId: 'source-missing' })).rejects.toThrow(
      'Source "source-missing" was not found in sources registry.',
    );
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
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-04T11:00:00.000Z',
    });

    await expect(handler({ sourceId: 'source-inactive' })).rejects.toBeInstanceOf(
      CollectorSourceInactiveError,
    );
    await expect(handler({ sourceId: 'source-inactive' })).rejects.toThrow(
      'Source "source-inactive" is inactive and cannot be collected.',
    );
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
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-04T11:00:00.000Z',
    });

    await expect(handler({ sourceId: 'source-invalid' })).rejects.toBeInstanceOf(
      CollectorSourceConfigInvalidError,
    );
    await expect(handler({ sourceId: 'source-invalid' })).rejects.toThrow(
      'Source "source-invalid" has invalid configuration:',
    );
  });
});
