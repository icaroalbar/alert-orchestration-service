import { describe, expect, it } from '@jest/globals';

import {
  createIntegrationConsumerHandler,
  type IntegrationConsumerPayload,
} from '../../../../src/handlers/shared/create-integration-consumer-handler';

class SpyLogger {
  public readonly infoCalls: unknown[][] = [];

  info(...args: unknown[]): void {
    this.infoCalls.push(args);
  }
}

class SpyRecordProcessor {
  public readonly calls: Array<{
    messageId: string;
    payload: IntegrationConsumerPayload;
    integrationName: string;
    targetBaseUrl: string;
  }> = [];

  invoke = (params: {
    messageId: string;
    payload: IntegrationConsumerPayload;
    integrationName: string;
    targetBaseUrl: string;
  }): Promise<void> => {
    this.calls.push(params);
    return Promise.resolve();
  };
}

describe('createIntegrationConsumerHandler', () => {
  it('creates reusable consumer handler and returns no batch item failures', async () => {
    const logger = new SpyLogger();
    const recordProcessor = new SpyRecordProcessor();
    const handler = createIntegrationConsumerHandler({
      integrationName: 'salesforce',
      targetBaseUrl: 'https://salesforce.internal',
      processRecord: recordProcessor.invoke,
      logger,
    });

    const result = await handler({
      Records: [
        {
          messageId: 'msg-1',
          body: '{"eventType":"customer.persisted","sourceId":"source-1","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
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
    expect(recordProcessor.calls).toEqual([
      {
        messageId: 'msg-1',
        payload: {
          eventType: 'customer.persisted',
          sourceId: 'source-1',
          correlationId: 'exec-1',
          publishedAt: '2026-03-04T10:00:00.000Z',
          customer: { id: 1 },
        },
        integrationName: 'salesforce',
        targetBaseUrl: 'https://salesforce.internal',
      },
    ]);
  });

  it('returns batch item failures for invalid records while keeping valid messages', async () => {
    const logger = new SpyLogger();
    const recordProcessor = new SpyRecordProcessor();
    const handler = createIntegrationConsumerHandler({
      integrationName: 'hubspot',
      targetBaseUrl: 'https://hubspot.internal',
      processRecord: recordProcessor.invoke,
      logger,
    });

    const result = await handler({
      Records: [
        {
          messageId: 'msg-valid',
          body: '{"eventType":"customer.persisted","sourceId":"source-1","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
        },
        {
          messageId: 'msg-invalid-json',
          body: '{',
        },
        {
          messageId: 'msg-invalid-schema',
          body: '{"eventType":"customer.persisted","sourceId":"","correlationId":"exec-2","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":2}}',
        },
      ],
    });

    expect(result).toEqual({
      batchItemFailures: [
        { itemIdentifier: 'msg-invalid-json' },
        { itemIdentifier: 'msg-invalid-schema' },
      ],
    });
    expect(recordProcessor.calls).toHaveLength(1);
    expect(
      logger.infoCalls.filter(([eventName]) => eventName === 'integration.consumer.invalid_record'),
    ).toHaveLength(2);
  });

  it('retries only transient failures and discards permanent failures', async () => {
    class PermanentError extends Error {}
    class TransientError extends Error {}

    const handler = createIntegrationConsumerHandler({
      integrationName: 'salesforce',
      targetBaseUrl: 'https://salesforce.internal',
      processRecord: ({ messageId }) => {
        if (messageId === 'msg-permanent') {
          return Promise.reject(new PermanentError('permanent_error'));
        }

        return Promise.reject(new TransientError('transient_error'));
      },
      classifyError: (error) => (error instanceof PermanentError ? 'permanent' : 'transient'),
      logger: new SpyLogger(),
    });

    const result = await handler({
      Records: [
        {
          messageId: 'msg-permanent',
          body: '{"eventType":"customer.persisted","sourceId":"source-1","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
          attributes: {
            ApproximateReceiveCount: '3',
          },
        },
        {
          messageId: 'msg-transient',
          body: '{"eventType":"customer.persisted","sourceId":"source-2","correlationId":"exec-2","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":2}}',
          attributes: {
            ApproximateReceiveCount: '1',
          },
        },
      ],
    });

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: 'msg-transient' }],
    });
  });
});
