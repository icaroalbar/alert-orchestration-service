import { type AttributeValue, DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
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

  const sourceId = raw.sourceId;
  if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
    throw new Error('Invalid scheduler source item: sourceId is required.');
  }

  const nextRunAt = raw.nextRunAt;
  if (typeof nextRunAt !== 'string' || nextRunAt.trim().length === 0) {
    throw new Error('Invalid scheduler source item: nextRunAt is required.');
  }

  return {
    sourceId: sourceId.trim(),
    nextRunAt: nextRunAt.trim(),
  };
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
    }: ListActiveSourcesParams): Promise<ListActiveSourcesResult> {
      const command = new QueryCommand({
        TableName: resolvedTableName,
        IndexName: resolvedActiveIndexName,
        KeyConditionExpression: '#active = :active',
        ExpressionAttributeNames: {
          '#active': 'active',
        },
        ExpressionAttributeValues: {
          ':active': {
            S: 'true',
          },
        },
        ProjectionExpression: 'sourceId, nextRunAt',
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
  };
}
