import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

import type {
  CollectorIdempotencyClaim,
  CollectorIdempotencyCompletion,
  CollectorIdempotencyRepository,
} from '../../domain/collector/collector-idempotency-repository';

export interface DynamoDbCollectorIdempotencyRepositoryParams {
  tableName: string;
  client?: DynamoDBClient;
}

const isConditionalCheckFailed = (error: unknown): boolean => {
  if (error instanceof ConditionalCheckFailedException) {
    return true;
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    return error.name === 'ConditionalCheckFailedException';
  }

  return false;
};

export const createDynamoDbCollectorIdempotencyRepository = ({
  tableName,
  client = new DynamoDBClient({}),
}: DynamoDbCollectorIdempotencyRepositoryParams): CollectorIdempotencyRepository => {
  const resolvedTableName = tableName.trim();
  if (resolvedTableName.length === 0) {
    throw new Error('tableName is required for collector idempotency repository.');
  }

  return {
    async tryClaim(claim: CollectorIdempotencyClaim): Promise<boolean> {
      const deduplicationKey = claim.deduplicationKey.trim();
      if (deduplicationKey.length === 0) {
        throw new Error('deduplicationKey is required for idempotency claim.');
      }

      const createdAt = claim.createdAt.trim();
      if (createdAt.length === 0) {
        throw new Error('createdAt is required for idempotency claim.');
      }

      const status = claim.status ?? 'COMPLETED';
      const allowRetryWhenPending = status === 'PENDING';

      try {
        await client.send(
          new PutItemCommand({
            TableName: resolvedTableName,
            Item: marshall({
              deduplicationKey,
              scope: claim.scope,
              status,
              sourceId: claim.sourceId,
              recordId: claim.recordId,
              cursor: claim.cursor,
              correlationId: claim.correlationId,
              createdAt,
              expiresAt: claim.expiresAtEpochSeconds,
            }),
            ConditionExpression: allowRetryWhenPending
              ? 'attribute_not_exists(#deduplicationKey) OR #status = :pending'
              : 'attribute_not_exists(#deduplicationKey)',
            ExpressionAttributeNames: {
              '#deduplicationKey': 'deduplicationKey',
              '#status': 'status',
            },
            ExpressionAttributeValues: allowRetryWhenPending
              ? marshall({
                  ':pending': 'PENDING',
                })
              : undefined,
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          return false;
        }

        throw error;
      }

      return true;
    },
    async markCompleted(params: CollectorIdempotencyCompletion): Promise<void> {
      const deduplicationKey = params.deduplicationKey.trim();
      if (deduplicationKey.length === 0) {
        throw new Error('deduplicationKey is required for idempotency completion.');
      }

      const completedAt = params.completedAt.trim();
      if (completedAt.length === 0) {
        throw new Error('completedAt is required for idempotency completion.');
      }

      await client.send(
        new UpdateItemCommand({
          TableName: resolvedTableName,
          Key: marshall({
            deduplicationKey,
          }),
          UpdateExpression:
            'SET #status = :completed, #completedAt = :completedAt, #expiresAt = :expiresAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#completedAt': 'completedAt',
            '#expiresAt': 'expiresAt',
          },
          ExpressionAttributeValues: marshall({
            ':completed': 'COMPLETED',
            ':completedAt': completedAt,
            ':expiresAt': params.expiresAtEpochSeconds,
          }),
        }),
      );
    },
  };
};
