import { describe, expect, it } from '@jest/globals';

import {
  SourceAlreadyExistsError,
  SourceVersionConflictError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../../src/domain/sources/source-registry-repository';
import { createHandler } from '../../../src/handlers/update-source';

const EXISTING_SOURCE: SourceRegistryRecord = {
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

  constructor(
    seed: SourceRegistryRecord[] = [],
    private readonly failUpdate = false,
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

  list(): Promise<{ items: SourceRegistryRecord[]; nextToken: string | null }> {
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
    if (this.failUpdate) {
      throw new SourceVersionConflictError(sourceId);
    }

    const current = this.storage.get(sourceId);
    if (!current || current.updatedAt !== expectedUpdatedAt) {
      throw new SourceVersionConflictError(sourceId);
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

describe('update-source handler', () => {
  it('updates only mutable fields and returns 200', async () => {
    const repository = new SpySourceRegistryRepository([EXISTING_SOURCE]);
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: EXISTING_SOURCE.sourceId },
      body: JSON.stringify({
        active: false,
      }),
      requestContext: tenantRequestContext('req-41'),
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      sourceId: EXISTING_SOURCE.sourceId,
      metadata: {
        schemaVersion: '1.0.0',
        createdAt: '2026-03-03T09:00:00.000Z',
        updatedAt: '2026-03-03T12:00:00.000Z',
        requestId: 'req-41',
      },
    });

    const stored = repository.getSnapshot(EXISTING_SOURCE.sourceId);
    expect(stored).toMatchObject({
      sourceId: 'source-acme',
      engine: 'postgres',
      active: false,
      nextRunAt: '2026-03-03T10:00:00.000Z',
      createdAt: '2026-03-03T09:00:00.000Z',
      updatedAt: '2026-03-03T12:00:00.000Z',
    });
  });

  it('recalculates nextRunAt when interval schedule is updated', async () => {
    const repository = new SpySourceRegistryRepository([EXISTING_SOURCE]);
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: EXISTING_SOURCE.sourceId },
      body: JSON.stringify({
        intervalMinutes: 45,
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(200);
    const stored = repository.getSnapshot(EXISTING_SOURCE.sourceId);
    expect(stored).toMatchObject({
      scheduleType: 'interval',
      intervalMinutes: 45,
      nextRunAt: '2026-03-03T12:45:00.000Z',
    });
  });

  it('returns 404 when source does not exist', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: 'missing-source' },
      body: JSON.stringify({ active: false }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Source "missing-source" was not found.',
      code: 'SOURCE_NOT_FOUND',
    });
  });

  it('returns 400 when payload contains immutable fields', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository([EXISTING_SOURCE]),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: EXISTING_SOURCE.sourceId },
      body: JSON.stringify({
        sourceId: 'other-source',
        active: false,
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as {
      message: string;
      errors: Array<{ field: string }>;
    };
    expect(parsed.message).toBe('Source payload validation failed.');
    expect(parsed.errors.some((entry) => entry.field === 'sourceId')).toBe(true);
  });

  it('returns 400 when payload tries to update nextRunAt directly', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository([EXISTING_SOURCE]),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: EXISTING_SOURCE.sourceId },
      body: JSON.stringify({
        nextRunAt: '2026-03-03T12:30:00.000Z',
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as {
      message: string;
      errors: Array<{ field: string }>;
    };
    expect(parsed.message).toBe('Source payload validation failed.');
    expect(parsed.errors.some((entry) => entry.field === 'nextRunAt')).toBe(true);
  });

  it('returns 409 when update detects version conflict', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository([EXISTING_SOURCE], true),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: EXISTING_SOURCE.sourceId },
      body: JSON.stringify({ active: false }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Source "source-acme" version conflict.',
      code: 'SOURCE_VERSION_CONFLICT',
    });
  });

  it('returns 400 when merged state violates source schema', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository([EXISTING_SOURCE]),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: EXISTING_SOURCE.sourceId },
      body: JSON.stringify({
        scheduleType: 'cron',
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as {
      message: string;
      errors: Array<{ field: string }>;
    };
    expect(parsed.message).toBe('Source payload validation failed.');
    expect(parsed.errors.some((entry) => entry.field === 'cronExpr')).toBe(true);
  });

  it('allows switching from interval to cron when cronExpr is provided', async () => {
    const repository = new SpySourceRegistryRepository([EXISTING_SOURCE]);
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      pathParameters: { id: EXISTING_SOURCE.sourceId },
      body: JSON.stringify({
        scheduleType: 'cron',
        cronExpr: '0 */15 * * *',
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(200);
    const stored = repository.getSnapshot(EXISTING_SOURCE.sourceId);
    expect(stored).toMatchObject({
      sourceId: 'source-acme',
      scheduleType: 'cron',
      cronExpr: '0 */15 * * *',
      nextRunAt: '2026-03-03T15:00:00.000Z',
    });
    expect(stored?.intervalMinutes).toBeUndefined();
  });
});
