import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

import {
  SourceAlreadyExistsError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../domain/sources/source-registry-repository';

export interface DynamoDbSourceRegistryRepositoryParams {
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

const toDynamoItem = (source: SourceRegistryRecord): Record<string, unknown> => ({
  sourceId: source.sourceId,
  active: source.active ? 'true' : 'false',
  engine: source.engine,
  secretArn: source.secretArn,
  query: source.query,
  cursorField: source.cursorField,
  fieldMap: source.fieldMap,
  scheduleType: source.scheduleType,
  intervalMinutes: source.scheduleType === 'interval' ? source.intervalMinutes : undefined,
  cronExpr: source.scheduleType === 'cron' ? source.cronExpr : undefined,
  nextRunAt: source.nextRunAt,
  schemaVersion: source.schemaVersion,
  createdAt: source.createdAt,
  updatedAt: source.updatedAt,
});

export function createDynamoDbSourceRegistryRepository({
  tableName,
  client = new DynamoDBClient({}),
}: DynamoDbSourceRegistryRepositoryParams): SourceRegistryRepository {
  const resolvedTableName = tableName.trim();
  if (resolvedTableName.length === 0) {
    throw new Error('tableName is required for Source registry repository.');
  }

  return {
    async create(source: SourceRegistryRecord): Promise<void> {
      const command = new PutItemCommand({
        TableName: resolvedTableName,
        Item: marshall(toDynamoItem(source), { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(sourceId)',
      });

      try {
        await client.send(command);
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          throw new SourceAlreadyExistsError(source.sourceId);
        }

        throw error;
      }
    },
  };
}
