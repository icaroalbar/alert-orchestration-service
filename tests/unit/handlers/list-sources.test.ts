import { describe, expect, it } from '@jest/globals';

import {
  SourcePaginationTokenError,
  type ListSourceRegistryParams,
  type ListSourceRegistryResult,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../../src/domain/sources/source-registry-repository';
import { createHandler } from '../../../src/handlers/list-sources';

const SOURCE_A: SourceRegistryRecord = {
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
  public readonly listCalls: ListSourceRegistryParams[] = [];

  constructor(
    private readonly listResult: ListSourceRegistryResult = { items: [], nextToken: null },
    private readonly listError?: Error,
  ) {}

  create(): Promise<void> {
    return Promise.resolve();
  }

  getById(): Promise<SourceRegistryRecord | null> {
    return Promise.resolve(null);
  }

  list(params: ListSourceRegistryParams): Promise<ListSourceRegistryResult> {
    this.listCalls.push(params);
    if (this.listError) {
      throw this.listError;
    }

    return Promise.resolve(this.listResult);
  }

  update(): Promise<void> {
    return Promise.resolve();
  }
}

describe('list-sources handler', () => {
  it('returns paginated source list with default limit', async () => {
    const repository = new SpySourceRegistryRepository({
      items: [SOURCE_A],
      nextToken: null,
    });
    const handler = createHandler({
      sourceRegistryRepository: repository,
    });

    const result = await handler({
      requestContext: { requestId: 'req-42' },
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers['content-type']).toBe('application/json');
    expect(repository.listCalls).toEqual([
      {
        limit: 25,
        nextToken: undefined,
        active: undefined,
        engine: undefined,
      },
    ]);
    expect(JSON.parse(result.body)).toEqual({
      items: [SOURCE_A],
      filters: {
        active: null,
        engine: null,
      },
      pagination: {
        limit: 25,
        nextToken: null,
      },
      requestId: 'req-42',
    });
  });

  it('parses filters and forwards token to repository', async () => {
    const repository = new SpySourceRegistryRepository({
      items: [],
      nextToken: 'next-page-token',
    });
    const handler = createHandler({
      sourceRegistryRepository: repository,
    });

    const result = await handler({
      queryStringParameters: {
        limit: '10',
        nextToken: 'opaque-token',
        active: 'false',
        engine: 'mysql',
      },
    });

    expect(result.statusCode).toBe(200);
    expect(repository.listCalls).toEqual([
      {
        limit: 10,
        nextToken: 'opaque-token',
        active: false,
        engine: 'mysql',
      },
    ]);
    expect(JSON.parse(result.body)).toEqual({
      items: [],
      filters: {
        active: false,
        engine: 'mysql',
      },
      pagination: {
        limit: 10,
        nextToken: 'next-page-token',
      },
      requestId: null,
    });
  });

  it('returns 400 when limit is invalid', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(),
    });

    const result = await handler({
      queryStringParameters: {
        limit: '0',
      },
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Query parameter "limit" must be an integer between 1 and 100.',
    });
  });

  it('returns 400 when active filter is invalid', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(),
    });

    const result = await handler({
      queryStringParameters: {
        active: 'yes',
      },
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Query parameter "active" must be "true" or "false".',
    });
  });

  it('returns 400 when engine filter is invalid', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(),
    });

    const result = await handler({
      queryStringParameters: {
        engine: 'oracle',
      },
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Query parameter "engine" must be one of: postgres, mysql.',
    });
  });

  it('returns 400 when nextToken is empty', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(),
    });

    const result = await handler({
      queryStringParameters: {
        nextToken: '   ',
      },
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Query parameter "nextToken" must be a non-empty string when provided.',
    });
  });

  it('returns 400 when repository rejects pagination token', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(
        { items: [], nextToken: null },
        new SourcePaginationTokenError(),
      ),
    });

    const result = await handler({
      queryStringParameters: {
        nextToken: 'invalid-token',
      },
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Invalid pagination token.',
      code: 'INVALID_PAGINATION_TOKEN',
    });
  });

  it('returns 500 for unexpected repository errors', async () => {
    const handler = createHandler({
      sourceRegistryRepository: new SpySourceRegistryRepository(
        { items: [], nextToken: null },
        new Error('timeout'),
      ),
    });

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Failed to list sources.',
    });
  });
});
