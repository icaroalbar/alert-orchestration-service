import { describe, expect, it } from '@jest/globals';
import type { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

import { createDynamoDbSchedulerSourceRepository } from '../../../../src/infra/sources/dynamodb-scheduler-source-repository';

class FakeDynamoClient {
  public readonly commands: QueryCommand[] = [];
  private readonly responses: Array<Record<string, unknown>>;

  constructor(responses: Array<Record<string, unknown>>) {
    this.responses = responses;
  }

  send(command: QueryCommand): Promise<Record<string, unknown>> {
    this.commands.push(command);
    return Promise.resolve(this.responses.shift() ?? {});
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
        Items: [
          marshall({
            sourceId: 'source-a',
            nextRunAt: '2026-03-04T10:00:00.000Z',
          }),
          marshall({
            sourceId: 'source-b',
            nextRunAt: '2026-03-04T11:00:00.000Z',
          }),
        ],
        LastEvaluatedKey: lastEvaluatedKey,
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

    expect(command.input.TableName).toBe('sources-table');
    expect(command.input.IndexName).toBe('active-nextRunAt-index');
    expect(command.input.KeyConditionExpression).toBe(
      '#active = :active AND #nextRunAt <= :nextRunAt',
    );
    expect(command.input.ExpressionAttributeNames).toEqual({
      '#active': 'active',
      '#nextRunAt': 'nextRunAt',
    });
    expect(command.input.ExpressionAttributeValues).toEqual({
      ':active': { S: 'true' },
      ':nextRunAt': { S: '2026-03-04T10:30:00.000Z' },
    });
    expect(command.input.ProjectionExpression).toBe('sourceId, nextRunAt');
    expect(command.input.Limit).toBe(2);
    expect(command.input.ScanIndexForward).toBe(true);
    expect(result.items).toEqual([
      { sourceId: 'source-a', nextRunAt: '2026-03-04T10:00:00.000Z' },
      { sourceId: 'source-b', nextRunAt: '2026-03-04T11:00:00.000Z' },
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
        Items: [
          marshall({
            sourceId: 'source-a',
            nextRunAt: '2026-03-04T10:00:00.000Z',
          }),
        ],
        LastEvaluatedKey: firstLastEvaluatedKey,
      },
      {
        Items: [
          marshall({
            sourceId: 'source-c',
            nextRunAt: '2026-03-04T12:00:00.000Z',
          }),
        ],
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
    expect(client.commands[1].input.ExclusiveStartKey).toEqual(firstLastEvaluatedKey);
  });

  it('keeps base key condition when now reference is not provided', async () => {
    const client = new FakeDynamoClient([{ Items: [] }]);
    const repository = createDynamoDbSchedulerSourceRepository({
      tableName: 'sources-table',
      client: client as unknown as DynamoDBClient,
    });

    await repository.listActiveSources({ limit: 1 });

    expect(client.commands[0].input.KeyConditionExpression).toBe('#active = :active');
    expect(client.commands[0].input.ExpressionAttributeNames).toEqual({
      '#active': 'active',
    });
    expect(client.commands[0].input.ExpressionAttributeValues).toEqual({
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
        Items: [
          marshall({
            sourceId: '',
            nextRunAt: '2026-03-04T10:00:00.000Z',
          }),
        ],
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
});
