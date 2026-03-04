import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

import { createStructuredLogger } from '../../shared/logging/structured-logger';

export interface RuntimeMetric {
  name: string;
  value: number;
  unit?: 'Count' | 'Milliseconds';
  dimensions?: Record<string, string>;
}

export interface RuntimeMetricsPublisher {
  publish: (metrics: RuntimeMetric[]) => Promise<void>;
}

export const createNoopMetricsPublisher = (): RuntimeMetricsPublisher => ({
  publish: async () => {},
});

export const createCloudWatchMetricsPublisher = ({
  namespace,
  stage,
  serviceName,
  client = new CloudWatchClient({}),
  logger = createStructuredLogger({
    component: 'runtime-metrics',
  }),
}: {
  namespace: string;
  stage: string;
  serviceName: string;
  client?: CloudWatchClient;
  logger?: Pick<typeof console, 'info'>;
}): RuntimeMetricsPublisher => {
  const normalizedNamespace = namespace.trim();
  if (normalizedNamespace.length === 0) {
    throw new Error('METRICS_NAMESPACE is required.');
  }

  return {
    publish: async (metrics: RuntimeMetric[]): Promise<void> => {
      if (metrics.length === 0) {
        return;
      }

      try {
        await client.send(
          new PutMetricDataCommand({
            Namespace: normalizedNamespace,
            MetricData: metrics.map((metric) => ({
              MetricName: metric.name,
              Value: metric.value,
              Unit: metric.unit ?? 'Count',
              Dimensions: [
                {
                  Name: 'Stage',
                  Value: stage,
                },
                {
                  Name: 'Service',
                  Value: serviceName,
                },
                ...Object.entries(metric.dimensions ?? {}).map(([dimensionName, dimensionValue]) => ({
                  Name: dimensionName,
                  Value: dimensionValue,
                })),
              ],
            })),
          }),
        );
      } catch (error) {
        logger.info('runtime.metrics.publish_failed', {
          namespace: normalizedNamespace,
          metricsCount: metrics.length,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
};
