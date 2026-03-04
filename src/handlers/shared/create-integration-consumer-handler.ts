import { createStructuredLogger } from '../../shared/logging/structured-logger';

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
  tenantId: string;
  correlationId: string;
  publishedAt: string;
  customer: Record<string, unknown>;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const buildDeduplicationKey = ({
  correlationId,
}: {
  correlationId: string;
}): string => correlationId;

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
  const tenantId = parsed.tenantId;
  const correlationId = parsed.correlationId;
  const publishedAt = parsed.publishedAt;
  const customer = parsed.customer;

  if (eventType !== 'customer.persisted') {
    throw new Error('invalid_event_type');
  }
  if (!isNonEmptyString(sourceId)) {
    throw new Error('missing_source_id');
  }
  if (!isNonEmptyString(tenantId)) {
    throw new Error('missing_tenant_id');
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
    tenantId: tenantId.trim(),
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
  logger = createStructuredLogger({
    component: 'integration-consumer',
  }),
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
    let processedCount = 0;
    let retriedCount = 0;
    let deduplicatedCount = 0;
    let discardedCount = 0;
    const deliveredCorrelationIds = new Set<string>();

    for (const record of records) {
      let payload: IntegrationConsumerPayload | null = null;
      try {
        payload = parseConsumerPayload(record.body);
        const deduplicationKey = buildDeduplicationKey({
          correlationId: payload.correlationId,
        });

        if (deliveredCorrelationIds.has(deduplicationKey)) {
          deduplicatedCount += 1;
          logger.info('integration.consumer.deduplicated', {
            integrationName: normalizedIntegrationName,
            messageId: record.messageId,
            correlationId: payload.correlationId,
            deduplicationKey,
          });
          continue;
        }

        await processRecord({
          messageId: record.messageId,
          payload,
          integrationName: normalizedIntegrationName,
          targetBaseUrl: normalizedTargetBaseUrl,
        });
        deliveredCorrelationIds.add(deduplicationKey);
        processedCount += 1;
      } catch (error) {
        const classification = classifyError(error);
        const shouldRetry = classification === 'transient';
        if (shouldRetry) {
          batchItemFailures.push({
            itemIdentifier: record.messageId,
          });
          retriedCount += 1;
        } else {
          discardedCount += 1;
        }

        logger.info('integration.consumer.invalid_record', {
          integrationName: normalizedIntegrationName,
          messageId: record.messageId,
          receiveCount: record.attributes?.ApproximateReceiveCount ?? null,
          correlationId: payload?.correlationId ?? null,
          classification,
          action: shouldRetry ? 'retry' : 'discard',
          reason: error instanceof Error ? error.message : 'unknown_error',
        });
      }
    }
    logger.info('integration.consumer.batch_summary', {
      integrationName: normalizedIntegrationName,
      recordsCount: records.length,
      processedCount,
      retriedCount,
      deduplicatedCount,
      discardedCount,
    });

    return {
      batchItemFailures,
    };
  };
};
