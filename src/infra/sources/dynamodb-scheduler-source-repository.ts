import {
  type AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import type {
  ListActiveSourcesParams,
  ListActiveSourcesResult,
  SchedulerSource,
  SourceRepository,
} from '../../domain/scheduler/list-eligible-sources';

const ACTIVE_INDEX_DEFAULT = 'active-nextRunAt-index';

interface SchedulerPaginationTokenPayload {
  lastEvaluatedKey: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConditionalCheckFailed = (error: unknown): boolean => {
  if (error instanceof ConditionalCheckFailedException) {
    return true;
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    return error.name === 'ConditionalCheckFailedException';
  }

  return false;
};

const encodeToken = (lastEvaluatedKey?: Record<string, AttributeValue>): string | null => {
  if (!lastEvaluatedKey) {
    return null;
  }

  const payload: SchedulerPaginationTokenPayload = {
    lastEvaluatedKey: unmarshall(lastEvaluatedKey) as Record<string, unknown>,
  };

  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
};

const decodeToken = (token: string): Record<string, AttributeValue> => {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.lastEvaluatedKey)) {
      throw new Error('Invalid token format');
    }

    return marshall(parsed.lastEvaluatedKey, { removeUndefinedValues: true });
  } catch {
    throw new Error('Invalid scheduler pagination token.');
  }
};

const toSchedulerSource = (item: Record<string, AttributeValue>): SchedulerSource => {
  const raw = unmarshall(item) as Record<string, unknown>;

  const tenantId = raw.tenantId;
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new Error('Invalid scheduler source item: tenantId is required.');
  }

  const sourceId = raw.sourceId;
  if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
    throw new Error('Invalid scheduler source item: sourceId is required.');
  }

  const nextRunAt = raw.nextRunAt;
  if (typeof nextRunAt !== 'string' || nextRunAt.trim().length === 0) {
    throw new Error('Invalid scheduler source item: nextRunAt is required.');
  }

  const scheduleType = raw.scheduleType;
  if (scheduleType === 'interval') {
    const intervalMinutes = raw.intervalMinutes;
    if (
      typeof intervalMinutes !== 'number' ||
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes <= 0
    ) {
      throw new Error(
        'Invalid scheduler source item: intervalMinutes must be a positive integer.',
      );
    }

    return {
      tenantId: tenantId.trim(),
      sourceId: sourceId.trim(),
      nextRunAt: nextRunAt.trim(),
      scheduleType: 'interval',
      intervalMinutes,
    };
  }

  if (scheduleType === 'cron') {
    const cronExpr = raw.cronExpr;
    if (typeof cronExpr !== 'string' || cronExpr.trim().length === 0) {
      throw new Error('Invalid scheduler source item: cronExpr is required.');
    }

    return {
      tenantId: tenantId.trim(),
      sourceId: sourceId.trim(),
      nextRunAt: nextRunAt.trim(),
      scheduleType: 'cron',
      cronExpr: cronExpr.trim(),
    };
  }

  throw new Error('Invalid scheduler source item: scheduleType must be "interval" or "cron".');
};

export interface DynamoDbSchedulerSourceRepositoryParams {
  tableName: string;
  activeIndexName?: string;
  client?: DynamoDBClient;
}

export function createDynamoDbSchedulerSourceRepository({
  tableName,
  activeIndexName = ACTIVE_INDEX_DEFAULT,
  client = new DynamoDBClient({}),
}: DynamoDbSchedulerSourceRepositoryParams): SourceRepository {
  const resolvedTableName = tableName.trim();
  if (resolvedTableName.length === 0) {
    throw new Error('tableName is required for scheduler source repository.');
  }

  const resolvedActiveIndexName = activeIndexName.trim();
  if (resolvedActiveIndexName.length === 0) {
    throw new Error('activeIndexName is required for scheduler source repository.');
  }

  return {
    async listActiveSources({
      limit,
      nextToken,
      now,
    }: ListActiveSourcesParams): Promise<ListActiveSourcesResult> {
      const normalizedNow = now?.trim();
      const hasReferenceNow = typeof normalizedNow === 'string' && normalizedNow.length > 0;
      const command = new QueryCommand({
        TableName: resolvedTableName,
        IndexName: resolvedActiveIndexName,
        KeyConditionExpression: hasReferenceNow
          ? '#active = :active AND #nextRunAt <= :nextRunAt'
          : '#active = :active',
        ExpressionAttributeNames: hasReferenceNow
          ? {
              '#active': 'active',
              '#nextRunAt': 'nextRunAt',
            }
          : {
              '#active': 'active',
            },
        ExpressionAttributeValues: hasReferenceNow
          ? {
              ':active': {
                S: 'true',
              },
              ':nextRunAt': {
                S: normalizedNow,
              },
            }
          : {
              ':active': {
                S: 'true',
              },
            },
        ProjectionExpression: 'tenantId, sourceId, nextRunAt, scheduleType, intervalMinutes, cronExpr',
        ExclusiveStartKey: nextToken ? decodeToken(nextToken) : undefined,
        Limit: limit,
        ScanIndexForward: true,
      });

      const result = await client.send(command);

      return {
        items: (result.Items ?? []).map((item) => toSchedulerSource(item)),
        nextToken: encodeToken(result.LastEvaluatedKey),
      };
    },
    async reserveNextRun({ sourceId, expectedNextRunAt, nextRunAt, reservedAt }): Promise<boolean> {
      const command = new UpdateItemCommand({
        TableName: resolvedTableName,
        Key: marshall({ sourceId }),
        UpdateExpression: 'SET nextRunAt = :nextRunAt, updatedAt = :updatedAt',
        ConditionExpression:
          'attribute_exists(sourceId) AND active = :active AND nextRunAt = :expectedNextRunAt',
        ExpressionAttributeValues: {
          ':active': {
            S: 'true',
          },
          ':expectedNextRunAt': {
            S: expectedNextRunAt,
          },
          ':nextRunAt': {
            S: nextRunAt,
          },
          ':updatedAt': {
            S: reservedAt,
          },
        },
      });

      try {
        await client.send(command);
        return true;
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          return false;
        }

        throw error;
      }
    },
  };
}
