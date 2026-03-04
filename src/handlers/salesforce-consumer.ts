import {
  createIntegrationConsumerHandler,
  type IntegrationConsumerSqsEvent,
  type IntegrationConsumerSqsResult,
} from './shared/create-integration-consumer-handler';
import {
  IntegrationExternalApiPermanentError,
  IntegrationExternalApiTransientError,
  createIntegrationExternalApiClient,
} from '../infra/integrations/external-api-client';
import { createDynamoDbCollectorIdempotencyRepository } from '../infra/idempotency/dynamodb-collector-idempotency-repository';
import { createFetchIntegrationHttpClient } from '../infra/integrations/fetch-integration-http-client';
import { createCloudWatchMetricsPublisher } from '../infra/observability/cloudwatch-metrics-publisher';
import { createIntegrationDeliveryMetricsPublisher } from '../infra/observability/integration-delivery-metrics-publisher';

const SALESFORCE_INTEGRATION_NAME = 'salesforce';
const SALESFORCE_TARGET_BASE_URL_ENV = 'SALESFORCE_INTEGRATION_TARGET_BASE_URL';
const INTEGRATION_API_TIMEOUT_MS_ENV = 'INTEGRATION_API_TIMEOUT_MS';
const IDEMPOTENCY_TABLE_NAME_ENV = 'IDEMPOTENCY_TABLE_NAME';
const CONSUMER_IDEMPOTENCY_TTL_SECONDS_ENV = 'CONSUMER_IDEMPOTENCY_TTL_SECONDS';
const METRICS_NAMESPACE_ENV = 'METRICS_NAMESPACE';
const METRICS_NAMESPACE_DEFAULT = 'AlertOrchestrationService/Runtime';
const STAGE_ENV = 'STAGE';
const SERVICE_NAME_ENV = 'SERVICE_NAME';
const INTEGRATION_API_TIMEOUT_MS_DEFAULT = 5000;
const INTEGRATION_API_TIMEOUT_MS_MIN = 100;
const INTEGRATION_API_TIMEOUT_MS_MAX = 60000;
const CONSUMER_IDEMPOTENCY_TTL_SECONDS_DEFAULT = 604_800;
const CONSUMER_IDEMPOTENCY_TTL_SECONDS_MIN = 60;
const CONSUMER_IDEMPOTENCY_TTL_SECONDS_MAX = 2_592_000;

let cachedHandler:
  | ((event: IntegrationConsumerSqsEvent) => Promise<IntegrationConsumerSqsResult>)
  | undefined;

const getHandler = (): ((event: IntegrationConsumerSqsEvent) => Promise<IntegrationConsumerSqsResult>) => {
  if (cachedHandler) {
    return cachedHandler;
  }

  const targetBaseUrl = process.env[SALESFORCE_TARGET_BASE_URL_ENV];
  if (!targetBaseUrl || targetBaseUrl.trim().length === 0) {
    throw new Error(`${SALESFORCE_TARGET_BASE_URL_ENV} is required.`);
  }

  const timeoutRawValue = process.env[INTEGRATION_API_TIMEOUT_MS_ENV];
  let timeoutMs = INTEGRATION_API_TIMEOUT_MS_DEFAULT;
  if (timeoutRawValue) {
    timeoutMs = Number.parseInt(timeoutRawValue, 10);
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < INTEGRATION_API_TIMEOUT_MS_MIN ||
      timeoutMs > INTEGRATION_API_TIMEOUT_MS_MAX
    ) {
      throw new Error(
        `${INTEGRATION_API_TIMEOUT_MS_ENV} must be an integer between ${INTEGRATION_API_TIMEOUT_MS_MIN} and ${INTEGRATION_API_TIMEOUT_MS_MAX}.`,
      );
    }
  }

  const idempotencyTableName = process.env[IDEMPOTENCY_TABLE_NAME_ENV];
  if (!idempotencyTableName || idempotencyTableName.trim().length === 0) {
    throw new Error(`${IDEMPOTENCY_TABLE_NAME_ENV} is required.`);
  }

  let idempotencyTtlSeconds = CONSUMER_IDEMPOTENCY_TTL_SECONDS_DEFAULT;
  const idempotencyTtlRawValue = process.env[CONSUMER_IDEMPOTENCY_TTL_SECONDS_ENV];
  if (idempotencyTtlRawValue) {
    idempotencyTtlSeconds = Number.parseInt(idempotencyTtlRawValue, 10);
    if (
      !Number.isInteger(idempotencyTtlSeconds) ||
      idempotencyTtlSeconds < CONSUMER_IDEMPOTENCY_TTL_SECONDS_MIN ||
      idempotencyTtlSeconds > CONSUMER_IDEMPOTENCY_TTL_SECONDS_MAX
    ) {
      throw new Error(
        `${CONSUMER_IDEMPOTENCY_TTL_SECONDS_ENV} must be an integer between ${CONSUMER_IDEMPOTENCY_TTL_SECONDS_MIN} and ${CONSUMER_IDEMPOTENCY_TTL_SECONDS_MAX}.`,
      );
    }
  }

  const sendCustomerEvent = createIntegrationExternalApiClient({
    integrationName: SALESFORCE_INTEGRATION_NAME,
    targetBaseUrl,
    timeoutMs,
    httpClient: createFetchIntegrationHttpClient(),
    metricsPublisher: createIntegrationDeliveryMetricsPublisher({
      runtimeMetricsPublisher: createCloudWatchMetricsPublisher({
        namespace: process.env[METRICS_NAMESPACE_ENV] ?? METRICS_NAMESPACE_DEFAULT,
        stage: process.env[STAGE_ENV] ?? 'unknown',
        serviceName: process.env[SERVICE_NAME_ENV] ?? 'alert-orchestration-service',
      }),
    }),
  });

  cachedHandler = createIntegrationConsumerHandler({
    integrationName: SALESFORCE_INTEGRATION_NAME,
    targetBaseUrl,
    idempotencyRepository: createDynamoDbCollectorIdempotencyRepository({
      tableName: idempotencyTableName,
    }),
    idempotencyTtlSeconds,
    processRecord: ({ messageId, payload }) => sendCustomerEvent({ messageId, payload }),
    classifyError: (error) => {
      if (error instanceof IntegrationExternalApiPermanentError) {
        return 'permanent';
      }
      if (error instanceof IntegrationExternalApiTransientError) {
        return 'transient';
      }

      return 'transient';
    },
  });

  return cachedHandler;
};

export async function handler(event: IntegrationConsumerSqsEvent): Promise<IntegrationConsumerSqsResult> {
  return getHandler()(event);
}
