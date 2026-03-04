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
  integrationTargets,
  snsClient = new SNSClient({}),
}: {
  topicArn: string;
  integrationTargets: readonly string[];
  snsClient?: SNSClient;
}): CustomerEventsPublisher => {
  if (topicArn.trim().length === 0) {
    throw new Error('SNS topicArn is required for customer events publishing.');
  }
  if (integrationTargets.length === 0) {
    throw new Error('integrationTargets must include at least one integration identifier.');
  }

  const normalizedIntegrationTargets = Array.from(
    new Set(
      integrationTargets
        .map((target) => target.trim())
        .filter((target) => target.length > 0),
    ),
  );
  if (normalizedIntegrationTargets.length === 0) {
    throw new Error('integrationTargets must include at least one non-empty integration identifier.');
  }

  const encodedIntegrationTargets = normalizedIntegrationTargets.join(',');

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
        integrationTargets: normalizedIntegrationTargets,
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
            integrationTargets: {
              DataType: 'String',
              StringValue: encodedIntegrationTargets,
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
