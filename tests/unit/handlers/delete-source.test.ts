import { describe, expect, it } from '@jest/globals';

import {
  SourceAlreadyExistsError,
  SourceVersionConflictError,
  type ListSourceRegistryParams,
  type ListSourceRegistryResult,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../../src/domain/sources/source-registry-repository';
import { createHandler } from '../../../src/handlers/delete-source';

const ACTIVE_SOURCE: SourceRegistryRecord = {
  tenantId: 'tenant-acme',
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
  nextRunAt: '2026-03-03T10:00:00.000Z',
  schemaVersion: '1.0.0',
  createdAt: '2026-03-03T09:00:00.000Z',
  updatedAt: '2026-03-03T09:30:00.000Z',
};

class SpySourceRegistryRepository implements SourceRegistryRepository {
  private readonly storage = new Map<string, SourceRegistryRecord>();
  public readonly updateCalls: Array<{ sourceId: string; expectedUpdatedAt: string }> = [];

  constructor(
    seed: SourceRegistryRecord[] = [],
    private readonly updateError?: Error,
    private readonly mutateStorageBeforeUpdateError?: (
      storage: Map<string, SourceRegistryRecord>,
    ) => void,
  ) {
    for (const source of seed) {
      this.storage.set(source.sourceId, source);
    }
  }

  create(source: SourceRegistryRecord): Promise<void> {
    if (this.storage.has(source.sourceId)) {
      throw new SourceAlreadyExistsError(source.sourceId);
    }

    this.storage.set(source.sourceId, source);
    return Promise.resolve();
  }

  getById(sourceId: string): Promise<SourceRegistryRecord | null> {
    return Promise.resolve(this.storage.get(sourceId) ?? null);
  }

  list(params: ListSourceRegistryParams): Promise<ListSourceRegistryResult> {
    void params;
    return Promise.resolve({
      items: [...this.storage.values()],
      nextToken: null,
    });
  }

  update({
    sourceId,
    source,
    expectedUpdatedAt,
  }: {
    sourceId: string;
    source: SourceRegistryRecord;
    expectedUpdatedAt: string;
  }): Promise<void> {
    this.updateCalls.push({
      sourceId,
      expectedUpdatedAt,
    });

    const current = this.storage.get(sourceId);
    if (!current || current.updatedAt !== expectedUpdatedAt) {
      throw new SourceVersionConflictError(sourceId);
    }

    if (this.updateError) {
      this.mutateStorageBeforeUpdateError?.(this.storage);
      throw this.updateError;
    }

    this.storage.set(sourceId, source);
    return Promise.resolve();
  }

  getSnapshot(sourceId: string): SourceRegistryRecord | undefined {
    return this.storage.get(sourceId);
  }
}

const tenantRequestContext = (requestId?: string) => ({
  requestId,
  authorizer: {
    jwt: {
      claims: {
        tenant_id: 'tenant-acme',
      },
    },
  },
});

describe('delete-source handler', () => {
  it('deactivates active source and returns 204', async () => {
    const repository = new SpySourceRegistryRepository([ACTIVE_SOURCE]);
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: ACTIVE_SOURCE.sourceId },
      requestContext: tenantRequestContext(),
    });

    expect(result).toEqual({
      statusCode: 204,
      headers: {},
      body: '',
    });
    expect(repository.updateCalls).toHaveLength(1);

    const stored = repository.getSnapshot(ACTIVE_SOURCE.sourceId);
    expect(stored).toMatchObject({
      sourceId: ACTIVE_SOURCE.sourceId,
      active: false,
      updatedAt: '2026-03-03T12:00:00.000Z',
    });
  });

  it('returns 204 without update when source is already inactive', async () => {
    const repository = new SpySourceRegistryRepository([
      {
        ...ACTIVE_SOURCE,
        active: false,
      },
    ]);
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: ACTIVE_SOURCE.sourceId },
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(204);
    expect(repository.updateCalls).toHaveLength(0);
  });

  it('returns 404 when source does not exist', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: 'missing-source' },
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Source "missing-source" was not found.',
      code: 'SOURCE_NOT_FOUND',
    });
  });

  it('returns 400 when path parameter id is missing', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository([ACTIVE_SOURCE]),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: {},
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Path parameter "id" is required.',
    });
  });

  it('returns 409 when update conflicts and source remains active', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(
        [ACTIVE_SOURCE],
        new SourceVersionConflictError(ACTIVE_SOURCE.sourceId),
      ),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: ACTIVE_SOURCE.sourceId },
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body)).toEqual({
      message: `Source "${ACTIVE_SOURCE.sourceId}" version conflict.`,
      code: 'SOURCE_VERSION_CONFLICT',
    });
  });

  it('returns 204 when conflict happens but source is already inactive after revalidation', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(
        [ACTIVE_SOURCE],
        new SourceVersionConflictError(ACTIVE_SOURCE.sourceId),
        (storage) => {
          storage.set(ACTIVE_SOURCE.sourceId, {
            ...ACTIVE_SOURCE,
            active: false,
            updatedAt: '2026-03-03T11:45:00.000Z',
          });
        },
      ),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: ACTIVE_SOURCE.sourceId },
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(204);
    expect(result.body).toBe('');
  });

  it('returns 500 for unexpected persistence errors', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(
        [ACTIVE_SOURCE],
        new Error('timeout'),
      ),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: ACTIVE_SOURCE.sourceId },
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Failed to delete source.',
    });
  });
});
