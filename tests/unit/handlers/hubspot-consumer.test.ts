import { describe, expect, it, jest } from '@jest/globals';

describe('hubspot-consumer handler', () => {
  const originalEnv = process.env;

  it('fails when target URL env var is missing', async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.HUBSPOT_INTEGRATION_TARGET_BASE_URL;

    const module = await import('../../../src/handlers/hubspot-consumer');
    await expect(module.handler({ Records: [] })).rejects.toThrow(
      'HUBSPOT_INTEGRATION_TARGET_BASE_URL is required.',
    );
  });

  it('initializes with integration-specific configuration', async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      HUBSPOT_INTEGRATION_TARGET_BASE_URL: 'https://hubspot.internal',
    };

    const module = await import('../../../src/handlers/hubspot-consumer');
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
