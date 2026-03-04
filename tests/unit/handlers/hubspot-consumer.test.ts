import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('hubspot-consumer handler', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const mockIdempotencyRepositoryFactory = () => ({
    tryClaim: jest.fn(() => Promise.resolve(true)),
    markCompleted: jest.fn(() => Promise.resolve()),
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it('fails when target URL env var is missing', async () => {
    jest.resetModules();
    const idempotencyRepository = mockIdempotencyRepositoryFactory();
    jest.doMock('../../../src/infra/idempotency/dynamodb-collector-idempotency-repository', () => ({
      createDynamoDbCollectorIdempotencyRepository: () => idempotencyRepository,
    }));
    process.env = { ...originalEnv };
    delete process.env.HUBSPOT_INTEGRATION_TARGET_BASE_URL;

    const module = await import('../../../src/handlers/hubspot-consumer');
    await expect(module.handler({ Records: [] })).rejects.toThrow(
      'HUBSPOT_INTEGRATION_TARGET_BASE_URL is required.',
    );
  });

  it('initializes with integration-specific configuration', async () => {
    jest.resetModules();
    const idempotencyRepository = mockIdempotencyRepositoryFactory();
    jest.doMock('../../../src/infra/idempotency/dynamodb-collector-idempotency-repository', () => ({
      createDynamoDbCollectorIdempotencyRepository: () => idempotencyRepository,
    }));
    process.env = {
      ...originalEnv,
      HUBSPOT_INTEGRATION_TARGET_BASE_URL: 'https://hubspot.internal',
      IDEMPOTENCY_TABLE_NAME: 'idempotency-table',
    };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 202,
        text: () => Promise.resolve('accepted'),
      }),
    ) as never;

    const module = await import('../../../src/handlers/hubspot-consumer');
    await expect(
      module.handler({
        Records: [
          {
            messageId: 'msg-1',
            body: '{"eventType":"customer.persisted","sourceId":"source-1","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
          },
        ],
      }),
    ).resolves.toEqual({
      batchItemFailures: [],
    });
  });

  it('retries transient 5xx external errors by returning batch item failure', async () => {
    jest.resetModules();
    const idempotencyRepository = mockIdempotencyRepositoryFactory();
    jest.doMock('../../../src/infra/idempotency/dynamodb-collector-idempotency-repository', () => ({
      createDynamoDbCollectorIdempotencyRepository: () => idempotencyRepository,
    }));
    process.env = {
      ...originalEnv,
      HUBSPOT_INTEGRATION_TARGET_BASE_URL: 'https://hubspot.internal',
      IDEMPOTENCY_TABLE_NAME: 'idempotency-table',
    };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 503,
        text: () => Promise.resolve('temporary unavailable'),
      }),
    ) as never;

    const module = await import('../../../src/handlers/hubspot-consumer');
    await expect(
      module.handler({
        Records: [
          {
            messageId: 'msg-1',
            body: '{"eventType":"customer.persisted","sourceId":"source-1","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
            attributes: {
              ApproximateReceiveCount: '1',
            },
          },
        ],
      }),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'msg-1' }],
    });
  });
});
