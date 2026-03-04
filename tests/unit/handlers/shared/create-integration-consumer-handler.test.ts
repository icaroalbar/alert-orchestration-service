import { describe, expect, it } from '@jest/globals';

import { createIntegrationConsumerHandler } from '../../../../src/handlers/shared/create-integration-consumer-handler';

class SpyLogger {
  public readonly infoCalls: unknown[][] = [];

  info(...args: unknown[]): void {
    this.infoCalls.push(args);
  }
}

describe('createIntegrationConsumerHandler', () => {
  it('creates reusable consumer handler and returns no batch item failures', async () => {
    const logger = new SpyLogger();
    const handler = createIntegrationConsumerHandler({
      integrationName: 'salesforce',
      targetBaseUrl: 'https://salesforce.internal',
      logger,
    });

    const result = await handler({
      Records: [
        {
          messageId: 'msg-1',
          body: '{"id":1}',
        },
      ],
    });

    expect(result).toEqual({
      batchItemFailures: [],
    });
    expect(logger.infoCalls).toEqual([
      [
        'integration.consumer.received_batch',
        {
          integrationName: 'salesforce',
          targetBaseUrl: 'https://salesforce.internal',
          recordsCount: 1,
          messageIds: ['msg-1'],
        },
      ],
    ]);
  });
});
