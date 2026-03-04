export interface IntegrationConsumerSqsRecord {
  messageId: string;
  body: string;
  attributes?: {
    ApproximateReceiveCount?: string;
  };
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
  processRecord?: (record: {
    messageId: string;
    payload: IntegrationConsumerPayload;
    integrationName: string;
    targetBaseUrl: string;
  }) => Promise<void>;
  classifyError?: (error: unknown) => 'transient' | 'permanent';
  logger?: Pick<typeof console, 'info'>;
}

export interface IntegrationConsumerPayload {
  eventType: 'customer.persisted';
  sourceId: string;
  correlationId: string;
  publishedAt: string;
  customer: Record<string, unknown>;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseConsumerPayload = (rawBody: string): IntegrationConsumerPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('invalid_json');
  }

  if (!isRecord(parsed)) {
    throw new Error('invalid_payload_type');
  }

  const eventType = parsed.eventType;
  const sourceId = parsed.sourceId;
  const correlationId = parsed.correlationId;
  const publishedAt = parsed.publishedAt;
  const customer = parsed.customer;

  if (eventType !== 'customer.persisted') {
    throw new Error('invalid_event_type');
  }
  if (!isNonEmptyString(sourceId)) {
    throw new Error('missing_source_id');
  }
  if (!isNonEmptyString(correlationId)) {
    throw new Error('missing_correlation_id');
  }
  if (!isNonEmptyString(publishedAt)) {
    throw new Error('missing_published_at');
  }
  if (!isRecord(customer)) {
    throw new Error('invalid_customer_payload');
  }

  return {
    eventType,
    sourceId: sourceId.trim(),
    correlationId: correlationId.trim(),
    publishedAt: publishedAt.trim(),
    customer,
  };
};

export const createIntegrationConsumerHandler = ({
  integrationName,
  targetBaseUrl,
  processRecord = () => Promise.resolve(),
  classifyError = () => 'transient',
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

  return async (event: IntegrationConsumerSqsEvent): Promise<IntegrationConsumerSqsResult> => {
    const records = event.Records ?? [];
    logger.info('integration.consumer.received_batch', {
      integrationName: normalizedIntegrationName,
      targetBaseUrl: normalizedTargetBaseUrl,
      recordsCount: records.length,
      messageIds: records.map((record) => record.messageId),
    });

    const batchItemFailures: Array<{ itemIdentifier: string }> = [];
    for (const record of records) {
      try {
        const payload = parseConsumerPayload(record.body);
        await processRecord({
          messageId: record.messageId,
          payload,
          integrationName: normalizedIntegrationName,
          targetBaseUrl: normalizedTargetBaseUrl,
        });
      } catch (error) {
        const classification = classifyError(error);
        const shouldRetry = classification === 'transient';
        if (shouldRetry) {
          batchItemFailures.push({
            itemIdentifier: record.messageId,
          });
        }

        logger.info('integration.consumer.invalid_record', {
          integrationName: normalizedIntegrationName,
          messageId: record.messageId,
          receiveCount: record.attributes?.ApproximateReceiveCount ?? null,
          classification,
          action: shouldRetry ? 'retry' : 'discard',
          reason: error instanceof Error ? error.message : 'unknown_error',
        });
      }
    }

    return {
      batchItemFailures,
    };
  };
};
