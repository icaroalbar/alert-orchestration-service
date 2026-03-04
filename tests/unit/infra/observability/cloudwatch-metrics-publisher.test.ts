import { describe, expect, it } from '@jest/globals';
import type { PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

import { createCloudWatchMetricsPublisher } from '../../../../src/infra/observability/cloudwatch-metrics-publisher';

class SpyCloudWatchClient {
  public readonly commands: PutMetricDataCommand[] = [];

  send(command: PutMetricDataCommand): Promise<void> {
    this.commands.push(command);
    return Promise.resolve();
  }
}

describe('createCloudWatchMetricsPublisher', () => {
  it('sends metrics with default and custom dimensions', async () => {
    const client = new SpyCloudWatchClient();
    const publisher = createCloudWatchMetricsPublisher({
      namespace: 'AlertOrchestrationService/Runtime',
      stage: 'dev',
      serviceName: 'alert-orchestration-service',
      client: client as never,
    });

    await publisher.publish([
      {
        name: 'CollectorRecordsCollected',
        value: 10,
        unit: 'Count',
        dimensions: {
          SourceId: 'source-1',
        },
      },
    ]);

    expect(client.commands).toHaveLength(1);
    expect(client.commands[0]?.input).toEqual({
      Namespace: 'AlertOrchestrationService/Runtime',
      MetricData: [
        {
          MetricName: 'CollectorRecordsCollected',
          Value: 10,
          Unit: 'Count',
          Dimensions: [
            {
              Name: 'Stage',
              Value: 'dev',
            },
            {
              Name: 'Service',
              Value: 'alert-orchestration-service',
            },
            {
              Name: 'SourceId',
              Value: 'source-1',
            },
          ],
        },
      ],
    });
  });
});
