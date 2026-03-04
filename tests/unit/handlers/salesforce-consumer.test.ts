import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('salesforce-consumer handler', () => {
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
    delete process.env.SALESFORCE_INTEGRATION_TARGET_BASE_URL;

    const module = await import('../../../src/handlers/salesforce-consumer');
    await expect(module.handler({ Records: [] })).rejects.toThrow(
      'SALESFORCE_INTEGRATION_TARGET_BASE_URL is required.',
    );
  });

  it('initializes with integration-specific configuration', async () => {
    jest.resetModules();
    const idempotencyRepository = mockIdempotencyRepositoryFactory();
    jest.doMock('../../../src/infra/idempotency/dynamodb-collector-idempotency-repository', () => ({
      createDynamoDbCollectorIdempotencyRepository: () => idempotencyRepository,
    }));
    jest.doMock('../../../src/infra/security/secrets-manager-outbound-auth-headers-resolver', () => ({
      createSecretsManagerOutboundAuthHeadersResolver: () => () =>
        Promise.resolve({
          Authorization: 'Bearer token-123',
        }),
    }));
    process.env = {
      ...originalEnv,
      SALESFORCE_INTEGRATION_TARGET_BASE_URL: 'https://salesforce.internal',
      IDEMPOTENCY_TABLE_NAME: 'idempotency-table',
      SALESFORCE_INTEGRATION_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:salesforce',
    };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 202,
        text: () => Promise.resolve('accepted'),
      }),
    ) as never;

    const module = await import('../../../src/handlers/salesforce-consumer');
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

  it('discards permanent 4xx external errors without retrying the SQS message', async () => {
    jest.resetModules();
    const idempotencyRepository = mockIdempotencyRepositoryFactory();
    jest.doMock('../../../src/infra/idempotency/dynamodb-collector-idempotency-repository', () => ({
      createDynamoDbCollectorIdempotencyRepository: () => idempotencyRepository,
    }));
    jest.doMock('../../../src/infra/security/secrets-manager-outbound-auth-headers-resolver', () => ({
      createSecretsManagerOutboundAuthHeadersResolver: () => () =>
        Promise.resolve({
          Authorization: 'Bearer token-123',
        }),
    }));
    process.env = {
      ...originalEnv,
      SALESFORCE_INTEGRATION_TARGET_BASE_URL: 'https://salesforce.internal',
      IDEMPOTENCY_TABLE_NAME: 'idempotency-table',
      SALESFORCE_INTEGRATION_AUTH_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:salesforce',
    };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 422,
        text: () => Promise.resolve('invalid payload'),
      }),
    ) as never;

    const module = await import('../../../src/handlers/salesforce-consumer');
    await expect(
      module.handler({
        Records: [
          {
            messageId: 'msg-1',
            body: '{"eventType":"customer.persisted","sourceId":"source-1","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
            attributes: {
              ApproximateReceiveCount: '2',
            },
          },
        ],
      }),
    ).resolves.toEqual({
      batchItemFailures: [],
    });
  });
});
