import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import {
  CollectorCursorConflictError,
  type CollectorCursorRecord,
  type CollectorCursorRepository,
  type CollectorCursorValue,
} from '../../domain/collector/collector-cursor-repository';

export interface DynamoDbCollectorCursorRepositoryParams {
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

const toCursorAttributeValue = (cursor: CollectorCursorValue): AttributeValue => {
  if (typeof cursor === 'number') {
    if (!Number.isFinite(cursor)) {
      throw new Error('Collector cursor value must be a finite number.');
    }

    return {
      N: String(cursor),
    };
  }

  const normalized = cursor.trim();
  if (normalized.length === 0) {
    throw new Error('Collector cursor value must be a non-empty string.');
  }

  return {
    S: normalized,
  };
};

const toCollectorCursorRecord = (item: Record<string, AttributeValue>): CollectorCursorRecord => {
  const raw = unmarshall(item) as Record<string, unknown>;
  const source = raw.source;
  const last = raw.last;
  const updatedAt = raw.updatedAt;

  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Invalid collector cursor item: source is required.');
  }

  let normalizedLast: CollectorCursorValue;
  if (typeof last === 'number' && Number.isFinite(last)) {
    normalizedLast = last;
  } else if (typeof last === 'string' && last.trim().length > 0) {
    normalizedLast = last.trim();
  } else {
    throw new Error('Invalid collector cursor item: last must be string or finite number.');
  }

  if (typeof updatedAt !== 'string' || updatedAt.trim().length === 0) {
    throw new Error('Invalid collector cursor item: updatedAt is required.');
  }

  return {
    source: source.trim(),
    last: normalizedLast,
    updatedAt,
  };
};

export function createDynamoDbCollectorCursorRepository({
  tableName,
  client = new DynamoDBClient({}),
}: DynamoDbCollectorCursorRepositoryParams): CollectorCursorRepository {
  const resolvedTableName = tableName.trim();
  if (resolvedTableName.length === 0) {
    throw new Error('tableName is required for collector cursor repository.');
  }

  return {
    async getBySource(source: string): Promise<CollectorCursorRecord | null> {
      const normalizedSource = source.trim();
      if (normalizedSource.length === 0) {
        throw new Error('source is required for collector cursor lookup.');
      }

      const response = await client.send(
        new GetItemCommand({
          TableName: resolvedTableName,
          Key: marshall({
            source: normalizedSource,
          }),
          ConsistentRead: true,
        }),
      );

      if (!response.Item) {
        return null;
      }

      return toCollectorCursorRecord(response.Item);
    },
    async save({
      source,
      last,
      updatedAt,
      expectedUpdatedAt,
    }: {
      source: string;
      last: CollectorCursorValue;
      updatedAt: string;
      expectedUpdatedAt?: string;
    }): Promise<void> {
      const normalizedSource = source.trim();
      if (normalizedSource.length === 0) {
        throw new Error('source is required for collector cursor update.');
      }

      const normalizedUpdatedAt = updatedAt.trim();
      if (normalizedUpdatedAt.length === 0) {
        throw new Error('updatedAt is required for collector cursor update.');
      }

      const normalizedExpectedUpdatedAt =
        typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt.trim() : '';
      const hasExpectedUpdatedAt = normalizedExpectedUpdatedAt.length > 0;
      const expressionAttributeValues: Record<string, AttributeValue> = {
        ':last': toCursorAttributeValue(last),
        ':updatedAt': { S: normalizedUpdatedAt },
      };

      let conditionExpression: string;
      if (hasExpectedUpdatedAt) {
        expressionAttributeValues[':expectedUpdatedAt'] = { S: normalizedExpectedUpdatedAt };
        conditionExpression = 'attribute_exists(#source) AND #updatedAt = :expectedUpdatedAt';
      } else {
        conditionExpression = 'attribute_not_exists(#source)';
      }

      const command = new UpdateItemCommand({
        TableName: resolvedTableName,
        Key: marshall({
          source: normalizedSource,
        }),
        UpdateExpression: 'SET #last = :last, #updatedAt = :updatedAt',
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: {
          '#source': 'source',
          '#last': 'last',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: expressionAttributeValues,
      });

      try {
        await client.send(command);
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          throw new CollectorCursorConflictError(normalizedSource);
        }

        throw error;
      }
    },
  };
}
