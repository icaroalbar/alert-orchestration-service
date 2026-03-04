import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

import type {
  CollectorIdempotencyClaim,
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

      try {
        await client.send(
          new PutItemCommand({
            TableName: resolvedTableName,
            Item: marshall({
              deduplicationKey,
              scope: claim.scope,
              sourceId: claim.sourceId,
              recordId: claim.recordId,
              cursor: claim.cursor,
              correlationId: claim.correlationId,
              createdAt,
              expiresAt: claim.expiresAtEpochSeconds,
            }),
            ConditionExpression: 'attribute_not_exists(#deduplicationKey)',
            ExpressionAttributeNames: {
              '#deduplicationKey': 'deduplicationKey',
            },
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
  };
};
