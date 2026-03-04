import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('salesforce-consumer handler', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('fails when target URL env var is missing', async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SALESFORCE_INTEGRATION_TARGET_BASE_URL;

    const module = await import('../../../src/handlers/salesforce-consumer');
    await expect(module.handler({ Records: [] })).rejects.toThrow(
      'SALESFORCE_INTEGRATION_TARGET_BASE_URL is required.',
    );
  });

  it('initializes with integration-specific configuration', async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SALESFORCE_INTEGRATION_TARGET_BASE_URL: 'https://salesforce.internal',
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
            body: '{"customerId":"1"}',
          },
        ],
      }),
    ).resolves.toEqual({
      batchItemFailures: [],
    });
  });
});
