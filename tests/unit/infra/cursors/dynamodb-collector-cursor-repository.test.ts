import {
  ConditionalCheckFailedException,
  GetItemCommand,
  UpdateItemCommand,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it } from '@jest/globals';

import { CollectorCursorConflictError } from '../../../../src/domain/collector/collector-cursor-repository';
import { createDynamoDbCollectorCursorRepository } from '../../../../src/infra/cursors/dynamodb-collector-cursor-repository';

type FakeResponse =
  | {
      value: Record<string, unknown>;
    }
  | {
      error: unknown;
    };

class FakeDynamoClient {
  public readonly commands: Array<GetItemCommand | UpdateItemCommand> = [];
  private readonly responses: FakeResponse[];

  constructor(responses: FakeResponse[]) {
    this.responses = responses;
  }

  send(command: GetItemCommand | UpdateItemCommand): Promise<Record<string, unknown>> {
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

describe('createDynamoDbCollectorCursorRepository', () => {
  it('loads cursor snapshot by source', async () => {
    const client = new FakeDynamoClient([
      {
        value: {
          Item: marshall({
            source: 'source-acme',
            last: '2026-03-04T10:20:00.000Z',
            updatedAt: '2026-03-04T10:21:00.000Z',
          }),
        },
      },
    ]);

    const repository = createDynamoDbCollectorCursorRepository({
      tableName: 'cursors-table',
      client: client as unknown as DynamoDBClient,
    });

    const result = await repository.getBySource(' source-acme ');

    expect(result).toEqual({
      source: 'source-acme',
      last: '2026-03-04T10:20:00.000Z',
      updatedAt: '2026-03-04T10:21:00.000Z',
    });
    expect(client.commands[0]).toBeInstanceOf(GetItemCommand);
    const command = client.commands[0] as GetItemCommand;
    expect(command.input).toEqual({
      TableName: 'cursors-table',
      Key: marshall({ source: 'source-acme' }),
      ConsistentRead: true,
    });
  });

  it('saves first cursor using attribute_not_exists condition', async () => {
    const client = new FakeDynamoClient([{ value: {} }]);
    const repository = createDynamoDbCollectorCursorRepository({
      tableName: 'cursors-table',
      client: client as unknown as DynamoDBClient,
    });

    await repository.save({
      source: 'source-acme',
      last: '2026-03-04T10:20:00.000Z',
      updatedAt: '2026-03-04T10:21:00.000Z',
    });

    expect(client.commands[0]).toBeInstanceOf(UpdateItemCommand);
    const command = client.commands[0] as UpdateItemCommand;
    expect(command.input).toEqual({
      TableName: 'cursors-table',
      Key: marshall({ source: 'source-acme' }),
      UpdateExpression: 'SET #last = :last, #updatedAt = :updatedAt',
      ConditionExpression: 'attribute_not_exists(#source)',
      ExpressionAttributeNames: {
        '#source': 'source',
        '#last': 'last',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':last': { S: '2026-03-04T10:20:00.000Z' },
        ':updatedAt': { S: '2026-03-04T10:21:00.000Z' },
      },
    });
  });

  it('saves cursor advance with optimistic concurrency on updatedAt', async () => {
    const client = new FakeDynamoClient([{ value: {} }]);
    const repository = createDynamoDbCollectorCursorRepository({
      tableName: 'cursors-table',
      client: client as unknown as DynamoDBClient,
    });

    await repository.save({
      source: 'source-acme',
      last: 42,
      updatedAt: '2026-03-04T10:22:00.000Z',
      expectedUpdatedAt: '2026-03-04T10:21:00.000Z',
    });

    const command = client.commands[0] as UpdateItemCommand;
    expect(command.input.ConditionExpression).toBe(
      'attribute_exists(#source) AND #updatedAt = :expectedUpdatedAt',
    );
    expect(command.input.ExpressionAttributeValues).toEqual({
      ':last': { N: '42' },
      ':updatedAt': { S: '2026-03-04T10:22:00.000Z' },
      ':expectedUpdatedAt': { S: '2026-03-04T10:21:00.000Z' },
    });
  });

  it('maps conditional check failure into CollectorCursorConflictError', async () => {
    const client = new FakeDynamoClient([
      {
        error: new ConditionalCheckFailedException({
          message: 'The conditional request failed',
          $metadata: {},
        }),
      },
    ]);
    const repository = createDynamoDbCollectorCursorRepository({
      tableName: 'cursors-table',
      client: client as unknown as DynamoDBClient,
    });

    await expect(
      repository.save({
        source: 'source-acme',
        last: '2026-03-04T10:20:00.000Z',
        updatedAt: '2026-03-04T10:21:00.000Z',
      }),
    ).rejects.toBeInstanceOf(CollectorCursorConflictError);
  });
});
