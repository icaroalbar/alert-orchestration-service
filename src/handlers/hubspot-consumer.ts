import {
  createIntegrationConsumerHandler,
  type IntegrationConsumerSqsEvent,
  type IntegrationConsumerSqsResult,
} from './shared/create-integration-consumer-handler';

const HUBSPOT_INTEGRATION_NAME = 'hubspot';
const HUBSPOT_TARGET_BASE_URL_ENV = 'HUBSPOT_INTEGRATION_TARGET_BASE_URL';

let cachedHandler:
  | ((event: IntegrationConsumerSqsEvent) => Promise<IntegrationConsumerSqsResult>)
  | undefined;

const getHandler = (): ((event: IntegrationConsumerSqsEvent) => Promise<IntegrationConsumerSqsResult>) => {
  if (cachedHandler) {
    return cachedHandler;
  }

  const targetBaseUrl = process.env[HUBSPOT_TARGET_BASE_URL_ENV];
  if (!targetBaseUrl || targetBaseUrl.trim().length === 0) {
    throw new Error(`${HUBSPOT_TARGET_BASE_URL_ENV} is required.`);
  }

  cachedHandler = createIntegrationConsumerHandler({
    integrationName: HUBSPOT_INTEGRATION_NAME,
    targetBaseUrl,
  });

  return cachedHandler;
};

export async function handler(event: IntegrationConsumerSqsEvent): Promise<IntegrationConsumerSqsResult> {
  return getHandler()(event);
}
