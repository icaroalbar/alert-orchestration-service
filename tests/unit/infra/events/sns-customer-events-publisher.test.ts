import { describe, expect, it } from '@jest/globals';

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
      snsClient: spySnsClient as never,
    });

    const result = await publisher({
      sourceId: 'source-acme',
      correlationId: 'exec-123',
      publishedAt: '2026-03-04T10:00:00.000Z',
      records: [
        { id: 10, email: 'first@example.com' },
        { id: 11, email: 'second@example.com' },
      ],
    });

    expect(result).toEqual({ publishedCount: 2 });
    expect(spySnsClient.sendCalls).toHaveLength(2);
  });

  it('does not publish when no persisted records are provided', async () => {
    const spySnsClient = new SpySnsClient();
    const publisher = createSnsCustomerEventsPublisher({
      topicArn: 'arn:aws:sns:us-east-1:123456789012:client-events',
      snsClient: spySnsClient as never,
    });

    const result = await publisher({
      sourceId: 'source-acme',
      correlationId: 'exec-123',
      publishedAt: '2026-03-04T10:00:00.000Z',
      records: [],
    });

    expect(result).toEqual({ publishedCount: 0 });
    expect(spySnsClient.sendCalls).toHaveLength(0);
  });
});
