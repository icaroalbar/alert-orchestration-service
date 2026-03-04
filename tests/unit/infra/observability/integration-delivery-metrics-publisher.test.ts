import { describe, expect, it } from '@jest/globals';

import { createIntegrationDeliveryMetricsPublisher } from '../../../../src/infra/observability/integration-delivery-metrics-publisher';

describe('createIntegrationDeliveryMetricsPublisher', () => {
  it('publishes attempt, success and latency metrics', async () => {
    const calls: unknown[] = [];
    const publish = createIntegrationDeliveryMetricsPublisher({
      runtimeMetricsPublisher: {
        publish: (metrics) => {
          calls.push(metrics);
          return Promise.resolve();
        },
      },
    });

    await publish({
      integrationId: 'salesforce',
      sourceId: 'source-1',
      statusCode: 202,
      durationMs: 83,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      {
        name: 'IntegrationDeliveryAttempt',
        value: 1,
        unit: 'Count',
        dimensions: {
          IntegrationId: 'salesforce',
          SourceId: 'source-1',
        },
      },
      {
        name: 'IntegrationDeliverySuccess',
        value: 1,
        unit: 'Count',
        dimensions: {
          IntegrationId: 'salesforce',
          SourceId: 'source-1',
        },
      },
      {
        name: 'IntegrationDeliveryLatencyMs',
        value: 83,
        unit: 'Milliseconds',
        dimensions: {
          IntegrationId: 'salesforce',
          SourceId: 'source-1',
        },
      },
    ]);
  });

  it('publishes failure metric name for non-2xx status', async () => {
    const calls: unknown[] = [];
    const publish = createIntegrationDeliveryMetricsPublisher({
      runtimeMetricsPublisher: {
        publish: (metrics) => {
          calls.push(metrics);
          return Promise.resolve();
        },
      },
    });

    await publish({
      integrationId: 'hubspot',
      sourceId: 'source-2',
      statusCode: 503,
      durationMs: 120,
    });

    const metrics = calls[0] as Array<{ name: string }>;
    expect(metrics.map((metric) => metric.name)).toContain('IntegrationDeliveryFailure');
  });
});
