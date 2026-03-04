import {
  type AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import {
  SourcePaginationTokenError,
  SourceAlreadyExistsError,
  SourceVersionConflictError,
  type ListSourceRegistryParams,
  type ListSourceRegistryResult,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../domain/sources/source-registry-repository';
import { type SourceEngine, validateSourceSchemaV1 } from '../../domain/sources/source-schema';

export interface DynamoDbSourceRegistryRepositoryParams {
  tableName: string;
  client?: DynamoDBClient;
}

interface ListTokenPayload {
  tenantId: string;
  offset: number;
  active?: boolean;
  engine?: SourceEngine;
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

const encodeListToken = (payload: ListTokenPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');

const decodeListToken = (token: string): ListTokenPayload => {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SourcePaginationTokenError();
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.tenantId !== 'string' || record.tenantId.trim().length === 0) {
      throw new SourcePaginationTokenError();
    }

    if (!Number.isInteger(record.offset) || (record.offset as number) < 0) {
      throw new SourcePaginationTokenError();
    }

    const active =
      record.active === undefined
        ? undefined
        : typeof record.active === 'boolean'
          ? record.active
          : null;
    if (active === null) {
      throw new SourcePaginationTokenError();
    }

    const engine =
      record.engine === undefined
        ? undefined
        : record.engine === 'postgres' || record.engine === 'mysql'
          ? record.engine
          : null;
    if (engine === null) {
      throw new SourcePaginationTokenError();
    }

    return {
      tenantId: record.tenantId.trim(),
      offset: record.offset as number,
      active,
      engine,
    };
  } catch (error) {
    if (error instanceof SourcePaginationTokenError) {
      throw error;
    }

    throw new SourcePaginationTokenError();
  }
};

const areFiltersEqual = (token: ListTokenPayload, params: ListSourceRegistryParams): boolean =>
  token.tenantId === params.tenantId &&
  token.active === params.active &&
  token.engine === params.engine;

const buildScanFilter = (
  params: ListSourceRegistryParams,
): {
  FilterExpression?: string;
  ExpressionAttributeValues?: Record<string, AttributeValue>;
} => {
  const expressions: string[] = ['tenantId = :tenantId'];
  const values: Record<string, AttributeValue> = {
    ':tenantId': { S: params.tenantId },
  };

  if (params.active !== undefined) {
    expressions.push('active = :active');
    values[':active'] = { S: params.active ? 'true' : 'false' };
  }

  if (params.engine !== undefined) {
    expressions.push('engine = :engine');
    values[':engine'] = { S: params.engine };
  }

  return {
    FilterExpression: expressions.join(' AND '),
    ExpressionAttributeValues: values,
  };
};

const toDynamoItem = (source: SourceRegistryRecord): Record<string, unknown> => ({
  tenantId: source.tenantId,
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
    tenantId: raw.tenantId,
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
    async list(params: ListSourceRegistryParams): Promise<ListSourceRegistryResult> {
      const normalizedTenantId = params.tenantId.trim();
      if (normalizedTenantId.length === 0) {
        throw new Error('tenantId is required for source listing.');
      }

      const tokenPayload = params.nextToken ? decodeListToken(params.nextToken) : undefined;
      const offset = tokenPayload?.offset ?? 0;
      if (
        tokenPayload &&
        !areFiltersEqual(tokenPayload, {
          ...params,
          tenantId: normalizedTenantId,
        })
      ) {
        throw new SourcePaginationTokenError('Pagination token does not match provided filters.');
      }

      const filter = buildScanFilter({
        ...params,
        tenantId: normalizedTenantId,
      });
      const items: SourceRegistryRecord[] = [];
      let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

      do {
        const result = await client.send(
          new ScanCommand({
            TableName: resolvedTableName,
            ExclusiveStartKey: lastEvaluatedKey,
            ...filter,
          }),
        );

        if (result.Items) {
          items.push(...result.Items.map((item) => toSourceRegistryRecord(item)));
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      const sorted = items.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
      const pageItems = sorted.slice(offset, offset + params.limit);
      const nextOffset = offset + pageItems.length;
      const nextToken =
        nextOffset < sorted.length
          ? encodeListToken({
              tenantId: normalizedTenantId,
              offset: nextOffset,
              active: params.active,
              engine: params.engine,
            })
          : null;

      return {
        items: pageItems,
        nextToken,
      };
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
