import {
  ConditionalCheckFailedException,
  type DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { describe, expect, it } from '@jest/globals';
import { marshall } from '@aws-sdk/util-dynamodb';

import { createDynamoDbSchedulerSourceRepository } from '../../../../src/infra/sources/dynamodb-scheduler-source-repository';

type FakeResponse =
  | {
      value: Record<string, unknown>;
    }
  | {
      error: unknown;
    };

class FakeDynamoClient {
  public readonly commands: Array<QueryCommand | UpdateItemCommand> = [];
  private readonly responses: FakeResponse[];

  constructor(responses: FakeResponse[]) {
    this.responses = responses;
  }

  send(command: QueryCommand | UpdateItemCommand): Promise<Record<string, unknown>> {
    this.commands.push(command);
    const response = this.responses.shift();
    if (!response) {
      return Promise.resolve({});
    }

    if ('error' in response) {
      const rejection =
        response.error instanceof Error
          ? response.error
          : new Error(`FakeDynamoClient rejection: ${String(response.error)}`);
      return Promise.reject(rejection);
    }

    return Promise.resolve(response.value);
  }
}

describe('createDynamoDbSchedulerSourceRepository', () => {
  it('queries only active and eligible sources when now reference is provided', async () => {
    const lastEvaluatedKey = marshall({
      active: 'true',
      nextRunAt: '2026-03-04T10:00:00.000Z',
      sourceId: 'source-a',
    });
    const client = new FakeDynamoClient([
      {
        value: {
          Items: [
            marshall({
              sourceId: 'source-a',
              nextRunAt: '2026-03-04T10:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            }),
            marshall({
              sourceId: 'source-b',
              nextRunAt: '2026-03-04T11:00:00.000Z',
              scheduleType: 'cron',
              cronExpr: '*/5 * * * *',
            }),
          ],
          LastEvaluatedKey: lastEvaluatedKey,
        },
      },
    ]);

    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    const result = await repository.listActiveSources({
      limit: 2,
      now: '2026-03-04T10:30:00.000Z',
    });
    const command = client.commands[0];

    expect(command).toBeInstanceOf(QueryCommand);
    const queryCommand = command as QueryCommand;
    expect(queryCommand.input.TableName).toBe('sources-table');
    expect(queryCommand.input.IndexName).toBe('active-nextRunAt-index');
    expect(queryCommand.input.KeyConditionExpression).toBe(
      '#active = :active AND #nextRunAt <= :nextRunAt',
    );
    expect(queryCommand.input.ExpressionAttributeNames).toEqual({
      '#active': 'active',
      '#nextRunAt': 'nextRunAt',
    });
    expect(queryCommand.input.ExpressionAttributeValues).toEqual({
      ':active': { S: 'true' },
      ':nextRunAt': { S: '2026-03-04T10:30:00.000Z' },
    });
    expect(queryCommand.input.ProjectionExpression).toBe(
      'sourceId, nextRunAt, scheduleType, intervalMinutes, cronExpr',
    );
    expect(queryCommand.input.Limit).toBe(2);
    expect(queryCommand.input.ScanIndexForward).toBe(true);
    expect(result.items).toEqual([
      {
        sourceId: 'source-a',
        nextRunAt: '2026-03-04T10:00:00.000Z',
        scheduleType: 'interval',
        intervalMinutes: 5,
      },
      {
        sourceId: 'source-b',
        nextRunAt: '2026-03-04T11:00:00.000Z',
        scheduleType: 'cron',
        cronExpr: '*/5 * * * *',
      },
    ]);
    expect(typeof result.nextToken).toBe('string');
  });

  it('decodes nextToken into ExclusiveStartKey', async () => {
    const firstLastEvaluatedKey = marshall({
      active: 'true',
      nextRunAt: '2026-03-04T11:00:00.000Z',
      sourceId: 'source-b',
    });
    const client = new FakeDynamoClient([
      {
        value: {
          Items: [
            marshall({
              sourceId: 'source-a',
              nextRunAt: '2026-03-04T10:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            }),
          ],
          LastEvaluatedKey: firstLastEvaluatedKey,
        },
      },
      {
        value: {
          Items: [
            marshall({
              sourceId: 'source-c',
              nextRunAt: '2026-03-04T12:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            }),
          ],
        },
      },
    ]);

    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    const first = await repository.listActiveSources({ limit: 1 });
    await repository.listActiveSources({
      limit: 1,
      nextToken: first.nextToken ?? undefined,
    });

    expect(client.commands).toHaveLength(2);
    expect(client.commands[1]).toBeInstanceOf(QueryCommand);
    const queryCommand = client.commands[1] as QueryCommand;
    expect(queryCommand.input.ExclusiveStartKey).toEqual(firstLastEvaluatedKey);
  });

  it('keeps base key condition when now reference is not provided', async () => {
    const client = new FakeDynamoClient([{ value: { Items: [] } }]);
    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    await repository.listActiveSources({ limit: 1 });

    expect(client.commands[0]).toBeInstanceOf(QueryCommand);
    const queryCommand = client.commands[0] as QueryCommand;
    expect(queryCommand.input.KeyConditionExpression).toBe('#active = :active');
    expect(queryCommand.input.ExpressionAttributeNames).toEqual({
      '#active': 'active',
    });
    expect(queryCommand.input.ExpressionAttributeValues).toEqual({
      ':active': { S: 'true' },
    });
  });

  it('throws when nextToken is invalid', async () => {
    const client = new FakeDynamoClient([]);
    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    await expect(
      repository.listActiveSources({
        limit: 1,
        nextToken: 'not-base64-token',
      }),
    ).rejects.toThrow('Invalid scheduler pagination token.');
  });

  it('throws when item does not contain required fields', async () => {
    const client = new FakeDynamoClient([
      {
        value: {
          Items: [
            marshall({
              sourceId: '',
              nextRunAt: '2026-03-04T10:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            }),
          ],
        },
      },
    ]);

    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    await expect(repository.listActiveSources({ limit: 1 })).rejects.toThrow(
      'Invalid scheduler source item: sourceId is required.',
    );
  });

  it('reserves nextRunAt with conditional update', async () => {
    const client = new FakeDynamoClient([{ value: {} }]);
    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    const reserved = await repository.reserveNextRun({
      sourceId: 'source-a',
      expectedNextRunAt: '2026-03-04T09:00:00.000Z',
      nextRunAt: '2026-03-04T09:05:00.000Z',
      reservedAt: '2026-03-04T09:00:00.000Z',
    });

    expect(reserved).toBe(true);
    expect(client.commands[0]).toBeInstanceOf(UpdateItemCommand);
    const updateCommand = client.commands[0] as UpdateItemCommand;
    expect(updateCommand.input).toEqual({
      TableName: 'sources-table',
      Key: marshall({ sourceId: 'source-a' }),
      UpdateExpression: 'SET nextRunAt = :nextRunAt, updatedAt = :updatedAt',
      ConditionExpression:
        'attribute_exists(sourceId) AND active = :active AND nextRunAt = :expectedNextRunAt',
      ExpressionAttributeValues: {
        ':active': { S: 'true' },
        ':expectedNextRunAt': { S: '2026-03-04T09:00:00.000Z' },
        ':nextRunAt': { S: '2026-03-04T09:05:00.000Z' },
        ':updatedAt': { S: '2026-03-04T09:00:00.000Z' },
      },
    });
  });

  it('returns false when conditional update detects concurrency conflict', async () => {
    const client = new FakeDynamoClient([
      {
        error: new ConditionalCheckFailedException({
          $metadata: {},
          message: 'conditional failed',
        }),
      },
    ]);
    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    const reserved = await repository.reserveNextRun({
      sourceId: 'source-a',
      expectedNextRunAt: '2026-03-04T09:00:00.000Z',
      nextRunAt: '2026-03-04T09:05:00.000Z',
      reservedAt: '2026-03-04T09:00:00.000Z',
    });

    expect(reserved).toBe(false);
  });
});
