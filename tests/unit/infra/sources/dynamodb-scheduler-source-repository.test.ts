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
  it('queries only active sources with configured index and returns normalized page', async () => {
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

    const result = await repository.listActiveSources({ limit: 2 });
    const command = client.commands[0];

    expect(command.input.TableName).toBe('sources-table');
    expect(command.input.IndexName).toBe('active-nextRunAt-index');
    expect(command.input.KeyConditionExpression).toBe('#active = :active');
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
