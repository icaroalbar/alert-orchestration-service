import type { IntegrationConsumerPayload } from '../../handlers/shared/create-integration-consumer-handler';

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

const is4xx = (statusCode: number): boolean => statusCode >= 400 && statusCode < 500;
const is5xx = (statusCode: number): boolean => statusCode >= 500 && statusCode < 600;

export const createIntegrationExternalApiClient = ({
  integrationName,
  targetBaseUrl,
  timeoutMs,
  httpClient,
  nowMs = Date.now,
  logger = console,
}: {
  integrationName: string;
  targetBaseUrl: string;
  timeoutMs: number;
  httpClient: IntegrationHttpClient;
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

  return async ({ payload, messageId }: SendIntegrationCustomerEventParams): Promise<void> => {
    const startedAt = nowMs();
    const url = `${normalizedTargetBaseUrl}/customers/events`;

    const response = await httpClient({
      url,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        eventType: payload.eventType,
        sourceId: payload.sourceId,
        correlationId: payload.correlationId,
        occurredAt: payload.publishedAt,
        customer: payload.customer,
      }),
      timeoutMs,
    });
    const durationMs = nowMs() - startedAt;
    logger.info('integration.external_api.call_completed', {
      integrationName: normalizedIntegrationName,
      messageId,
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
