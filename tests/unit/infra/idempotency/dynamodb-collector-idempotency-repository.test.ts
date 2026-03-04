import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { describe, expect, it } from '@jest/globals';

import { createDynamoDbCollectorIdempotencyRepository } from '../../../../src/infra/idempotency/dynamodb-collector-idempotency-repository';

class SpyDynamoDbClient {
  public readonly sendCalls: unknown[] = [];

  constructor(private readonly behavior: 'success' | 'conditional-failed' = 'success') {}

  send(command: unknown): Promise<void> {
    this.sendCalls.push(command);
    if (this.behavior === 'conditional-failed') {
      return Promise.reject(
        new ConditionalCheckFailedException({
          $metadata: {},
          message: 'conditional failed',
        }),
      );
    }

    return Promise.resolve();
  }
}

describe('createDynamoDbCollectorIdempotencyRepository', () => {
  it('claims a deduplication key when it does not exist yet', async () => {
    const client = new SpyDynamoDbClient('success');
    const repository = createDynamoDbCollectorIdempotencyRepository({
      tableName: 'idempotency-table',
      client: client as never,
    });

    const result = await repository.tryClaim({
      deduplicationKey: 'upsert:source:cursor:1',
      scope: 'upsert',
      sourceId: 'source',
      recordId: '1',
      cursor: 'cursor',
      correlationId: 'exec-1',
      createdAt: '2026-03-04T10:00:00.000Z',
      expiresAtEpochSeconds: 1_776_000_000,
    });

    expect(result).toBe(true);
    expect(client.sendCalls).toHaveLength(1);
  });

  it('returns false when key was already claimed', async () => {
    const client = new SpyDynamoDbClient('conditional-failed');
    const repository = createDynamoDbCollectorIdempotencyRepository({
      tableName: 'idempotency-table',
      client: client as never,
    });

    const result = await repository.tryClaim({
      deduplicationKey: 'upsert:source:cursor:1',
      scope: 'upsert',
      sourceId: 'source',
      recordId: '1',
      cursor: 'cursor',
      correlationId: 'exec-1',
      createdAt: '2026-03-04T10:00:00.000Z',
      expiresAtEpochSeconds: 1_776_000_000,
    });

    expect(result).toBe(false);
    expect(client.sendCalls).toHaveLength(1);
  });
});
