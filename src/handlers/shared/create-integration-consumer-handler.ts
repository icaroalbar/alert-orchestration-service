import { createStructuredLogger } from '../../shared/logging/structured-logger';
import type { CollectorIdempotencyRepository } from '../../domain/collector/collector-idempotency-repository';

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
  idempotencyRepository?: CollectorIdempotencyRepository;
  idempotencyTtlSeconds?: number;
  now?: () => string;
  nowMs?: () => number;
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

const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 604_800;

const noopIdempotencyRepository: CollectorIdempotencyRepository = {
  tryClaim: () => Promise.resolve(true),
  markCompleted: () => Promise.resolve(),
};

const resolveDeduplicationRecordId = ({
  messageId,
  payload,
}: {
  messageId: string;
  payload: IntegrationConsumerPayload;
}): string => {
  const customerId = payload.customer.id;
  if (typeof customerId === 'string') {
    const normalizedCustomerId = customerId.trim();
    if (normalizedCustomerId.length > 0) {
      return normalizedCustomerId;
    }
  }

  if (typeof customerId === 'number' && Number.isFinite(customerId)) {
    return String(customerId);
  }

  return messageId.trim();
};

const buildDeduplicationKey = ({
  integrationName,
  correlationId,
  recordId,
}: {
  integrationName: string;
  correlationId: string;
  recordId: string;
}): string => `consumer:${integrationName}:${correlationId}:${recordId}`;

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
  idempotencyRepository = noopIdempotencyRepository,
  idempotencyTtlSeconds = DEFAULT_IDEMPOTENCY_TTL_SECONDS,
  now = () => new Date().toISOString(),
  nowMs = Date.now,
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
  if (!Number.isInteger(idempotencyTtlSeconds) || idempotencyTtlSeconds <= 0) {
    throw new Error('idempotencyTtlSeconds must be a positive integer.');
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
    for (const record of records) {
      let payload: IntegrationConsumerPayload | null = null;
      try {
        payload = parseConsumerPayload(record.body);
        const deduplicationRecordId = resolveDeduplicationRecordId({
          messageId: record.messageId,
          payload,
        });
        const deduplicationKey = buildDeduplicationKey({
          integrationName: normalizedIntegrationName,
          correlationId: payload.correlationId,
          recordId: deduplicationRecordId,
        });
        const claimCreatedAt = now();
        const claimExpiration = Math.floor(nowMs() / 1000) + idempotencyTtlSeconds;
        const claimed = await idempotencyRepository.tryClaim({
          deduplicationKey,
          scope: 'consumer',
          status: 'PENDING',
          sourceId: payload.sourceId,
          recordId: deduplicationRecordId,
          cursor: payload.publishedAt,
          correlationId: payload.correlationId,
          createdAt: claimCreatedAt,
          expiresAtEpochSeconds: claimExpiration,
        });
        if (!claimed) {
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
        await idempotencyRepository.markCompleted({
          deduplicationKey,
          completedAt: now(),
          expiresAtEpochSeconds: claimExpiration,
        });
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
