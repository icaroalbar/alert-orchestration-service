import type { RuntimeMetricsPublisher } from './cloudwatch-metrics-publisher';

export interface PublishIntegrationDeliveryMetricsParams {
  integrationId: string;
  sourceId: string;
  statusCode: number;
  durationMs: number;
}

export type PublishIntegrationDeliveryMetrics = (
  params: PublishIntegrationDeliveryMetricsParams,
) => Promise<void>;

export const createIntegrationDeliveryMetricsPublisher = ({
  runtimeMetricsPublisher,
}: {
  runtimeMetricsPublisher: RuntimeMetricsPublisher;
}): PublishIntegrationDeliveryMetrics => {
  return async ({
    integrationId,
    sourceId,
    statusCode,
    durationMs,
  }: PublishIntegrationDeliveryMetricsParams): Promise<void> => {
    const isSuccessfulDelivery = statusCode >= 200 && statusCode < 300;

    await runtimeMetricsPublisher.publish([
      {
        name: 'IntegrationDeliveryAttempt',
        value: 1,
        unit: 'Count',
        dimensions: {
          IntegrationId: integrationId,
          SourceId: sourceId,
        },
      },
      {
        name: isSuccessfulDelivery ? 'IntegrationDeliverySuccess' : 'IntegrationDeliveryFailure',
        value: 1,
        unit: 'Count',
        dimensions: {
          IntegrationId: integrationId,
          SourceId: sourceId,
        },
      },
      {
        name: 'IntegrationDeliveryLatencyMs',
        value: durationMs,
        unit: 'Milliseconds',
        dimensions: {
          IntegrationId: integrationId,
          SourceId: sourceId,
        },
      },
    ]);
  };
};
