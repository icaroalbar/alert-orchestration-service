import { describe, expect, it } from '@jest/globals';

import {
  SourceAlreadyExistsError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../../src/domain/sources/source-registry-repository';
import { createHandler } from '../../../src/handlers/create-source';

const VALID_INTERVAL_SOURCE = {
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
} as const;

class SpySourceRegistryRepository implements SourceRegistryRepository {
  public readonly created: SourceRegistryRecord[] = [];

  constructor(private readonly shouldFailWith?: Error) {}

  create(source: SourceRegistryRecord): Promise<void> {
    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }

    this.created.push(source);
    return Promise.resolve();
  }

  getById(sourceId: string): Promise<SourceRegistryRecord | null> {
    const found = this.created.find((item) => item.sourceId === sourceId);
    return Promise.resolve(found ?? null);
  }

  update(): Promise<void> {
    return Promise.resolve();
  }
}

describe('create-source handler', () => {
  it('creates source and returns 201 with metadata', async () => {
    const repository = new SpySourceRegistryRepository();
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      body: JSON.stringify(VALID_INTERVAL_SOURCE),
      requestContext: { requestId: 'req-40' },
    });

    expect(result.statusCode).toBe(201);
    expect(result.headers['content-type']).toBe('application/json');
    expect(JSON.parse(result.body)).toEqual({
      sourceId: 'source-acme',
      metadata: {
        schemaVersion: '1.0.0',
        createdAt: '2026-03-03T12:00:00.000Z',
        updatedAt: '2026-03-03T12:00:00.000Z',
        requestId: 'req-40',
      },
    });
    expect(repository.created).toHaveLength(1);
    expect(repository.created[0]).toMatchObject({
      sourceId: 'source-acme',
      schemaVersion: '1.0.0',
      createdAt: '2026-03-03T12:00:00.000Z',
      updatedAt: '2026-03-03T12:00:00.000Z',
    });
  });

  it('returns 422 when payload validation fails', async () => {
    const repository = new SpySourceRegistryRepository();
    const handler = createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      body: JSON.stringify({
        ...VALID_INTERVAL_SOURCE,
        sourceId: '',
      }),
    });

    expect(result.statusCode).toBe(422);
    const parsedBody = JSON.parse(result.body) as {
      message: string;
      errors: Array<{ field: string }>;
    };
    expect(parsedBody.message).toBe('Source payload validation failed.');
    expect(parsedBody.errors.some((entry) => entry.field === 'sourceId')).toBe(true);
    expect(repository.created).toHaveLength(0);
  });

  it('returns 400 when body is invalid json', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      body: '{invalid-json',
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Request body must be valid JSON.',
    });
  });

  it('returns 409 when source already exists', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(
        new SourceAlreadyExistsError('source-acme'),
      ),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      body: JSON.stringify(VALID_INTERVAL_SOURCE),
    });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Source "source-acme" already exists.',
      code: 'SOURCE_ALREADY_EXISTS',
    });
  });

  it('returns 500 for unexpected repository errors', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(new Error('network timeout')),
      now: () => '2026-03-03T12:00:00.000Z',
    });

    const result = await handler({
      body: JSON.stringify(VALID_INTERVAL_SOURCE),
    });

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Failed to create source.',
    });
  });
});
