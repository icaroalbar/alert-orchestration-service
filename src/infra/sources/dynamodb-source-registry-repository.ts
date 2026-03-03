import {
  type AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import {
  SourceAlreadyExistsError,
  SourceVersionConflictError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../domain/sources/source-registry-repository';
import { validateSourceSchemaV1 } from '../../domain/sources/source-schema';

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

const parseActive = (value: unknown): boolean | null => {
  if (value === 'true' || value === true) {
    return true;
  }

  if (value === 'false' || value === false) {
    return false;
  }

  return null;
};

const toSourceRegistryRecord = (item: Record<string, AttributeValue>): SourceRegistryRecord => {
  const raw = unmarshall(item) as Record<string, unknown>;
  const active = parseActive(raw.active);
  if (active === null) {
    throw new Error('Invalid Source registry record: active must be "true" or "false".');
  }

  const validation = validateSourceSchemaV1({
    sourceId: raw.sourceId,
    active,
    engine: raw.engine,
    secretArn: raw.secretArn,
    query: raw.query,
    cursorField: raw.cursorField,
    fieldMap: raw.fieldMap,
    scheduleType: raw.scheduleType,
    intervalMinutes: raw.intervalMinutes,
    cronExpr: raw.cronExpr,
    nextRunAt: raw.nextRunAt,
  });

  if (!validation.success) {
    throw new Error('Invalid Source registry record shape in DynamoDB.');
  }

  if (
    typeof raw.schemaVersion !== 'string' ||
    raw.schemaVersion.trim().length === 0 ||
    typeof raw.createdAt !== 'string' ||
    raw.createdAt.trim().length === 0 ||
    typeof raw.updatedAt !== 'string' ||
    raw.updatedAt.trim().length === 0
  ) {
    throw new Error('Invalid Source registry metadata in DynamoDB.');
  }

  return {
    ...validation.value,
    schemaVersion: raw.schemaVersion,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
};

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
    async getById(sourceId: string): Promise<SourceRegistryRecord | null> {
      const command = new GetItemCommand({
        TableName: resolvedTableName,
        Key: marshall({ sourceId }),
        ConsistentRead: true,
      });

      const result = await client.send(command);
      if (!result.Item) {
        return null;
      }

      return toSourceRegistryRecord(result.Item);
    },
    async update({
      sourceId,
      source,
      expectedUpdatedAt,
    }: {
      sourceId: string;
      source: SourceRegistryRecord;
      expectedUpdatedAt: string;
    }): Promise<void> {
      const command = new PutItemCommand({
        TableName: resolvedTableName,
        Item: marshall(toDynamoItem(source), { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_exists(sourceId) AND updatedAt = :expectedUpdatedAt',
        ExpressionAttributeValues: {
          ':expectedUpdatedAt': {
            S: expectedUpdatedAt,
          },
        },
      });

      try {
        await client.send(command);
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          throw new SourceVersionConflictError(sourceId);
        }

        throw error;
      }
    },
  };
}
