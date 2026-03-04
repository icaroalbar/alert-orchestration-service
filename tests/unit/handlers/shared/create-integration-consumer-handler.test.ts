import { describe, expect, it } from '@jest/globals';

import type {
  CollectorIdempotencyClaim,
  CollectorIdempotencyCompletion,
} from '../../../../src/domain/collector/collector-idempotency-repository';
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

class SpyIntegrationConsumerIdempotencyRepository {
  public readonly tryClaimCalls: CollectorIdempotencyClaim[] = [];
  public readonly markCompletedCalls: CollectorIdempotencyCompletion[] = [];
  private readonly statusByKey = new Map<string, 'PENDING' | 'COMPLETED'>();

  constructor(preCompletedKeys: string[] = []) {
    for (const key of preCompletedKeys) {
      this.statusByKey.set(key, 'COMPLETED');
    }
  }

  tryClaim = (claim: CollectorIdempotencyClaim): Promise<boolean> => {
    this.tryClaimCalls.push(claim);
    const currentStatus = this.statusByKey.get(claim.deduplicationKey);
    if (currentStatus === 'COMPLETED') {
      return Promise.resolve(false);
    }

    this.statusByKey.set(claim.deduplicationKey, claim.status ?? 'COMPLETED');
    return Promise.resolve(true);
  };

  markCompleted = (params: CollectorIdempotencyCompletion): Promise<void> => {
    this.markCompletedCalls.push(params);
    this.statusByKey.set(params.deduplicationKey, 'COMPLETED');
    return Promise.resolve();
  };
}

describe('createIntegrationConsumerHandler', () => {
  it('creates reusable consumer handler and returns no batch item failures', async () => {
    const logger = new SpyLogger();
    const recordProcessor = new SpyRecordProcessor();
    const idempotencyRepository = new SpyIntegrationConsumerIdempotencyRepository();
    const handler = createIntegrationConsumerHandler({
      integrationName: 'salesforce',
      targetBaseUrl: 'https://salesforce.internal',
      idempotencyRepository,
      processRecord: recordProcessor.invoke,
      logger,
      now: () => '2026-03-04T11:00:00.000Z',
      nowMs: () => 1000,
    });

    const result = await handler({
      Records: [
        {
          messageId: 'msg-1',
          body: '{"eventType":"customer.persisted","sourceId":"source-1","tenantId":"tenant-acme","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
        },
      ],
    });

    expect(result).toEqual({
      batchItemFailures: [],
    });
    expect(logger.infoCalls).toEqual(expect.arrayContaining([
      [
        'integration.consumer.received_batch',
        {
          integrationName: 'salesforce',
          targetBaseUrl: 'https://salesforce.internal',
          recordsCount: 1,
          messageIds: ['msg-1'],
        },
      ],
      [
        'integration.consumer.batch_summary',
        {
          integrationName: 'salesforce',
          recordsCount: 1,
          processedCount: 1,
          retriedCount: 0,
          deduplicatedCount: 0,
          discardedCount: 0,
        },
      ],
    ]));
    expect(recordProcessor.calls).toEqual([
      {
        messageId: 'msg-1',
        payload: {
          eventType: 'customer.persisted',
          sourceId: 'source-1',
          tenantId: 'tenant-acme',
          correlationId: 'exec-1',
          publishedAt: '2026-03-04T10:00:00.000Z',
          customer: { id: 1 },
        },
        integrationName: 'salesforce',
        targetBaseUrl: 'https://salesforce.internal',
      },
    ]);
    expect(idempotencyRepository.tryClaimCalls).toEqual([
      {
        deduplicationKey: 'consumer:salesforce:exec-1:1',
        scope: 'consumer',
        status: 'PENDING',
        sourceId: 'source-1',
        recordId: '1',
        cursor: '2026-03-04T10:00:00.000Z',
        correlationId: 'exec-1',
        createdAt: '2026-03-04T11:00:00.000Z',
        expiresAtEpochSeconds: 604801,
      },
    ]);
    expect(idempotencyRepository.markCompletedCalls).toEqual([
      {
        deduplicationKey: 'consumer:salesforce:exec-1:1',
        completedAt: '2026-03-04T11:00:00.000Z',
        expiresAtEpochSeconds: 604801,
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
          body: '{"eventType":"customer.persisted","sourceId":"source-1","tenantId":"tenant-acme","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
        },
        {
          messageId: 'msg-invalid-json',
          body: '{',
        },
        {
          messageId: 'msg-invalid-schema',
          body: '{"eventType":"customer.persisted","sourceId":"","tenantId":"tenant-acme","correlationId":"exec-2","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":2}}',
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
          body: '{"eventType":"customer.persisted","sourceId":"source-1","tenantId":"tenant-acme","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
          attributes: {
            ApproximateReceiveCount: '3',
          },
        },
        {
          messageId: 'msg-transient',
          body: '{"eventType":"customer.persisted","sourceId":"source-2","tenantId":"tenant-acme","correlationId":"exec-2","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":2}}',
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

  it('deduplicates redelivered message already completed for the same customer event', async () => {
    const logger = new SpyLogger();
    const recordProcessor = new SpyRecordProcessor();
    const idempotencyRepository = new SpyIntegrationConsumerIdempotencyRepository([
      'consumer:hubspot:exec-1:1',
    ]);
    const handler = createIntegrationConsumerHandler({
      integrationName: 'hubspot',
      targetBaseUrl: 'https://hubspot.internal',
      idempotencyRepository,
      processRecord: recordProcessor.invoke,
      logger,
    });

    const result = await handler({
      Records: [
        {
          messageId: 'msg-redelivery',
          body: '{"eventType":"customer.persisted","sourceId":"source-1","tenantId":"tenant-acme","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
        },
      ],
    });

    expect(result).toEqual({
      batchItemFailures: [],
    });
    expect(recordProcessor.calls).toEqual([]);
    expect(
      logger.infoCalls.some(([eventName]) => eventName === 'integration.consumer.deduplicated'),
    ).toBe(true);
    expect(logger.infoCalls).toEqual(expect.arrayContaining([
      [
        'integration.consumer.batch_summary',
        {
          integrationName: 'hubspot',
          recordsCount: 1,
          processedCount: 0,
          retriedCount: 0,
          deduplicatedCount: 1,
          discardedCount: 0,
        },
      ],
    ]));
  });

  it('keeps failed delivery pending and retries successfully on next attempt', async () => {
    class TransientError extends Error {}

    const idempotencyRepository = new SpyIntegrationConsumerIdempotencyRepository();
    let shouldFail = true;
    const handler = createIntegrationConsumerHandler({
      integrationName: 'salesforce',
      targetBaseUrl: 'https://salesforce.internal',
      idempotencyRepository,
      processRecord: () => {
        if (shouldFail) {
          shouldFail = false;
          return Promise.reject(new TransientError('temporary_failure'));
        }

        return Promise.resolve();
      },
      classifyError: () => 'transient',
    });

    const event = {
      Records: [
        {
          messageId: 'msg-1',
          body: '{"eventType":"customer.persisted","sourceId":"source-1","tenantId":"tenant-acme","correlationId":"exec-1","publishedAt":"2026-03-04T10:00:00.000Z","customer":{"id":1}}',
          attributes: {
            ApproximateReceiveCount: '1',
          },
        },
      ],
    };

    const firstAttempt = await handler(event);
    const secondAttempt = await handler(event);

    expect(firstAttempt).toEqual({
      batchItemFailures: [{ itemIdentifier: 'msg-1' }],
    });
    expect(secondAttempt).toEqual({
      batchItemFailures: [],
    });
    expect(
      idempotencyRepository.tryClaimCalls
        .filter((claim) => claim.scope === 'consumer')
        .map((claim) => claim.status),
    ).toEqual(['PENDING', 'PENDING']);
    expect(idempotencyRepository.markCompletedCalls).toHaveLength(1);
    expect(idempotencyRepository.markCompletedCalls[0]).toMatchObject({
      deduplicationKey: 'consumer:salesforce:exec-1:1',
    });
  });
});
