import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

import type { CollectorStandardizedRecord } from '../../domain/collector/collect-postgres-records';

export interface PublishCustomerEventsParams {
  sourceId: string;
  correlationId: string;
  records: readonly CollectorStandardizedRecord[];
  publishedAt: string;
}

export interface PublishCustomerEventsResult {
  publishedCount: number;
}

export type CustomerEventsPublisher = (
  params: PublishCustomerEventsParams,
) => Promise<PublishCustomerEventsResult>;

export const createSnsCustomerEventsPublisher = ({
  topicArn,
  snsClient = new SNSClient({}),
}: {
  topicArn: string;
  snsClient?: SNSClient;
}): CustomerEventsPublisher => {
  if (topicArn.trim().length === 0) {
    throw new Error('SNS topicArn is required for customer events publishing.');
  }

  return async ({
    sourceId,
    correlationId,
    records,
    publishedAt,
  }: PublishCustomerEventsParams): Promise<PublishCustomerEventsResult> => {
    if (records.length === 0) {
      return {
        publishedCount: 0,
      };
    }

    for (const record of records) {
      const message = {
        eventType: 'customer.persisted',
        sourceId,
        correlationId,
        publishedAt,
        customer: record,
      };

      await snsClient.send(
        new PublishCommand({
          TopicArn: topicArn,
          Message: JSON.stringify(message),
          MessageAttributes: {
            sourceId: {
              DataType: 'String',
              StringValue: sourceId,
            },
            correlationId: {
              DataType: 'String',
              StringValue: correlationId,
            },
          },
        }),
      );
    }

    return {
      publishedCount: records.length,
    };
  };
};
