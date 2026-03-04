import type { IntegrationConsumerPayload } from '../../handlers/shared/create-integration-consumer-handler';
import { createStructuredLogger } from '../../shared/logging/structured-logger';
import type { PublishIntegrationDeliveryMetrics } from '../observability/integration-delivery-metrics-publisher';

export class IntegrationExternalApiPermanentError extends Error {
  constructor(
    public readonly integrationName: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationExternalApiPermanentError';
  }
}

export class IntegrationExternalApiTransientError extends Error {
  constructor(
    public readonly integrationName: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationExternalApiTransientError';
  }
}

export class IntegrationExternalApiAuthError extends Error {
  constructor(
    public readonly integrationName: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationExternalApiAuthError';
  }
}

export interface SendIntegrationCustomerEventParams {
  payload: IntegrationConsumerPayload;
  messageId: string;
}

export type IntegrationHttpClient = (request: {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}) => Promise<{ status: number; text(): Promise<string> }>;

export type IntegrationCustomerEventSender = (
  params: SendIntegrationCustomerEventParams,
) => Promise<void>;

const noopMetricsPublisher: PublishIntegrationDeliveryMetrics = async () => {};

const is4xx = (statusCode: number): boolean => statusCode >= 400 && statusCode < 500;
const is5xx = (statusCode: number): boolean => statusCode >= 500 && statusCode < 600;

export const createIntegrationExternalApiClient = ({
  integrationName,
  targetBaseUrl,
  timeoutMs,
  httpClient,
  resolveAuthHeaders = () => Promise.resolve({}),
  metricsPublisher = noopMetricsPublisher,
  nowMs = Date.now,
  logger = console,
}: {
  integrationName: string;
  targetBaseUrl: string;
  timeoutMs: number;
  httpClient: IntegrationHttpClient;
  resolveAuthHeaders?: () => Promise<Record<string, string>>;
  metricsPublisher?: PublishIntegrationDeliveryMetrics;
  nowMs?: () => number;
  logger?: Pick<typeof console, 'info'>;
}): IntegrationCustomerEventSender => {
  const normalizedIntegrationName = integrationName.trim();
  if (normalizedIntegrationName.length === 0) {
    throw new Error('integrationName is required for external API client.');
  }

  const normalizedTargetBaseUrl = targetBaseUrl.trim().replace(/\/+$/, '');
  if (normalizedTargetBaseUrl.length === 0) {
    throw new Error('targetBaseUrl is required for external API client.');
  }
  const structuredLogger = logger === console
    ? createStructuredLogger({
        component: `integration-external-api:${normalizedIntegrationName}`,
      })
    : logger;

  return async ({ payload, messageId }: SendIntegrationCustomerEventParams): Promise<void> => {
    const startedAt = nowMs();
    const url = `${normalizedTargetBaseUrl}/customers/events`;
    let authHeaders: Record<string, string>;
    try {
      authHeaders = await resolveAuthHeaders();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'UnknownError';
      throw new IntegrationExternalApiAuthError(
        normalizedIntegrationName,
        `Outbound auth resolution failed: ${reason}`,
      );
    }

    const response = await httpClient({
      url,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        eventType: payload.eventType,
        integrationId: normalizedIntegrationName,
        sourceId: payload.sourceId,
        tenantId: payload.tenantId,
        correlationId: payload.correlationId,
        occurredAt: payload.publishedAt,
        customer: payload.customer,
      }),
      timeoutMs,
    });
    const durationMs = nowMs() - startedAt;
    structuredLogger.info('integration.external_api.call_completed', {
      integrationName: normalizedIntegrationName,
      messageId,
      correlationId: payload.correlationId,
      statusCode: response.status,
      durationMs,
    });
    await metricsPublisher({
      integrationId: normalizedIntegrationName,
      sourceId: payload.sourceId,
      statusCode: response.status,
      durationMs,
    });

    if (is4xx(response.status)) {
      const responseBody = await response.text();
      throw new IntegrationExternalApiPermanentError(
        normalizedIntegrationName,
        response.status,
        `Permanent external API error (${response.status}): ${responseBody}`,
      );
    }

    if (is5xx(response.status)) {
      const responseBody = await response.text();
      throw new IntegrationExternalApiTransientError(
        normalizedIntegrationName,
        response.status,
        `Transient external API error (${response.status}): ${responseBody}`,
      );
    }
  };
};
