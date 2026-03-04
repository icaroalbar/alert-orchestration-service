import { describe, expect, it } from '@jest/globals';
import type { PublishCommand } from '@aws-sdk/client-sns';

import { createSnsCustomerEventsPublisher } from '../../../../src/infra/events/sns-customer-events-publisher';

class SpySnsClient {
  public readonly sendCalls: unknown[] = [];

  send(command: unknown): Promise<{ MessageId: string }> {
    this.sendCalls.push(command);
    return Promise.resolve({ MessageId: `msg-${this.sendCalls.length}` });
  }
}

describe('createSnsCustomerEventsPublisher', () => {
  it('publishes one event per persisted record with source and correlation metadata', async () => {
    const spySnsClient = new SpySnsClient();
    const publisher = createSnsCustomerEventsPublisher({
      topicArn: 'arn:aws:sns:us-east-1:123456789012:client-events',
      integrationTargets: ['salesforce', 'hubspot'],
      snsClient: spySnsClient as never,
    });

    const result = await publisher({
      sourceId: 'source-acme',
      tenantId: 'tenant-acme',
      correlationId: 'exec-123',
      publishedAt: '2026-03-04T10:00:00.000Z',
      records: [
        { id: 10, email: 'first@example.com' },
        { id: 11, email: 'second@example.com' },
      ],
    });

    expect(result).toEqual({ publishedCount: 2 });
    expect(spySnsClient.sendCalls).toHaveLength(2);

    const firstCommand = spySnsClient.sendCalls[0] as PublishCommand;
    expect(firstCommand.input.MessageAttributes).toEqual({
      sourceId: {
        DataType: 'String',
        StringValue: 'source-acme',
      },
      tenantId: {
        DataType: 'String',
        StringValue: 'tenant-acme',
      },
      correlationId: {
        DataType: 'String',
        StringValue: 'exec-123',
      },
      integrationTargets: {
        DataType: 'String',
        StringValue: 'salesforce,hubspot',
      },
    });

    const firstMessage = JSON.parse(firstCommand.input.Message ?? '{}') as Record<string, unknown>;
    expect(firstMessage.tenantId).toBe('tenant-acme');
    expect(firstMessage.integrationTargets).toEqual(['salesforce', 'hubspot']);
  });

  it('does not publish when no persisted records are provided', async () => {
    const spySnsClient = new SpySnsClient();
    const publisher = createSnsCustomerEventsPublisher({
      topicArn: 'arn:aws:sns:us-east-1:123456789012:client-events',
      integrationTargets: ['salesforce'],
      snsClient: spySnsClient as never,
    });

    const result = await publisher({
      sourceId: 'source-acme',
      tenantId: 'tenant-acme',
      correlationId: 'exec-123',
      publishedAt: '2026-03-04T10:00:00.000Z',
      records: [],
    });

    expect(result).toEqual({ publishedCount: 0 });
    expect(spySnsClient.sendCalls).toHaveLength(0);
  });

  it('rejects empty integration target configuration', () => {
    expect(() =>
      createSnsCustomerEventsPublisher({
        topicArn: 'arn:aws:sns:us-east-1:123456789012:client-events',
        integrationTargets: [],
        snsClient: new SpySnsClient() as never,
      }),
    ).toThrow('integrationTargets must include at least one integration identifier.');
  });
});
