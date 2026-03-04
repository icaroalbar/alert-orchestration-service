export interface IntegrationConsumerSqsRecord {
  messageId: string;
  body: string;
}

export interface IntegrationConsumerSqsEvent {
  Records?: IntegrationConsumerSqsRecord[];
}

export interface IntegrationConsumerSqsResult {
  batchItemFailures: Array<{
    itemIdentifier: string;
  }>;
}

export interface CreateIntegrationConsumerHandlerParams {
  integrationName: string;
  targetBaseUrl: string;
  logger?: Pick<typeof console, 'info'>;
}

export const createIntegrationConsumerHandler = ({
  integrationName,
  targetBaseUrl,
  logger = console,
}: CreateIntegrationConsumerHandlerParams) => {
  const normalizedIntegrationName = integrationName.trim();
  if (normalizedIntegrationName.length === 0) {
    throw new Error('integrationName is required for integration consumer.');
  }

  const normalizedTargetBaseUrl = targetBaseUrl.trim();
  if (normalizedTargetBaseUrl.length === 0) {
    throw new Error(
      `targetBaseUrl is required for integration consumer "${normalizedIntegrationName}".`,
    );
  }

  return (event: IntegrationConsumerSqsEvent): Promise<IntegrationConsumerSqsResult> => {
    const records = event.Records ?? [];
    logger.info('integration.consumer.received_batch', {
      integrationName: normalizedIntegrationName,
      targetBaseUrl: normalizedTargetBaseUrl,
      recordsCount: records.length,
      messageIds: records.map((record) => record.messageId),
    });

    return Promise.resolve({
      batchItemFailures: [],
    });
  };
};
