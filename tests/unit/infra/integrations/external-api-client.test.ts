import { describe, expect, it } from '@jest/globals';

import {
  IntegrationExternalApiAuthError,
  IntegrationExternalApiPermanentError,
  IntegrationExternalApiTransientError,
  createIntegrationExternalApiClient,
} from '../../../../src/infra/integrations/external-api-client';

class SpyLogger {
  public readonly infoCalls: unknown[][] = [];

  info(...args: unknown[]): void {
    this.infoCalls.push(args);
  }
}

describe('createIntegrationExternalApiClient', () => {
  it('sends mapped payload and logs response time', async () => {
    const requests: unknown[] = [];
    const metricCalls: unknown[] = [];
    const logger = new SpyLogger();
    let current = 1000;
    const nowMs = () => {
      current += 25;
      return current;
    };

    const client = createIntegrationExternalApiClient({
      integrationName: 'salesforce',
      targetBaseUrl: 'https://salesforce.internal',
      timeoutMs: 3000,
      nowMs,
      logger,
      metricsPublisher: (metric) => {
        metricCalls.push(metric);
        return Promise.resolve();
      },
      resolveAuthHeaders: () =>
        Promise.resolve({
          Authorization: 'Bearer token-123',
          'x-api-key': 'key-123',
        }),
      httpClient: (request) => {
        requests.push(request);
        return Promise.resolve({
          status: 202,
          text: () => Promise.resolve('accepted'),
        });
      },
    });

    await expect(
      client({
        messageId: 'msg-1',
        payload: {
          eventType: 'customer.persisted',
          sourceId: 'source-1',
          tenantId: 'tenant-acme',
          correlationId: 'exec-1',
          publishedAt: '2026-03-04T10:00:00.000Z',
          customer: { id: 1 },
        },
      }),
    ).resolves.toBeUndefined();

    expect(requests).toEqual([
      {
        url: 'https://salesforce.internal/customers/events',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer token-123',
          'x-api-key': 'key-123',
        },
        body: JSON.stringify({
          eventType: 'customer.persisted',
          integrationId: 'salesforce',
          sourceId: 'source-1',
          tenantId: 'tenant-acme',
          correlationId: 'exec-1',
          occurredAt: '2026-03-04T10:00:00.000Z',
          customer: { id: 1 },
        }),
        timeoutMs: 3000,
      },
    ]);
    expect(logger.infoCalls).toEqual([
      [
        'integration.external_api.call_completed',
        {
          integrationName: 'salesforce',
          messageId: 'msg-1',
          correlationId: 'exec-1',
          statusCode: 202,
          durationMs: 25,
        },
      ],
    ]);
    expect(metricCalls).toEqual([
      {
        integrationId: 'salesforce',
        sourceId: 'source-1',
        statusCode: 202,
        durationMs: 25,
      },
    ]);
  });

  it('throws permanent error for 4xx responses', async () => {
    const client = createIntegrationExternalApiClient({
      integrationName: 'hubspot',
      targetBaseUrl: 'https://hubspot.internal',
      timeoutMs: 3000,
      httpClient: () =>
        Promise.resolve({
          status: 422,
          text: () => Promise.resolve('invalid payload'),
        }),
    });

    await expect(
      client({
        messageId: 'msg-1',
        payload: {
          eventType: 'customer.persisted',
          sourceId: 'source-1',
          tenantId: 'tenant-acme',
          correlationId: 'exec-1',
          publishedAt: '2026-03-04T10:00:00.000Z',
          customer: { id: 1 },
        },
      }),
    ).rejects.toBeInstanceOf(IntegrationExternalApiPermanentError);
  });

  it('throws transient error for 5xx responses', async () => {
    const client = createIntegrationExternalApiClient({
      integrationName: 'hubspot',
      targetBaseUrl: 'https://hubspot.internal',
      timeoutMs: 3000,
      httpClient: () =>
        Promise.resolve({
          status: 503,
          text: () => Promise.resolve('temporary unavailable'),
        }),
    });

    await expect(
      client({
        messageId: 'msg-1',
        payload: {
          eventType: 'customer.persisted',
          sourceId: 'source-1',
          tenantId: 'tenant-acme',
          correlationId: 'exec-1',
          publishedAt: '2026-03-04T10:00:00.000Z',
          customer: { id: 1 },
        },
      }),
    ).rejects.toBeInstanceOf(IntegrationExternalApiTransientError);
  });

  it('throws auth error when outbound auth resolution fails', async () => {
    const client = createIntegrationExternalApiClient({
      integrationName: 'hubspot',
      targetBaseUrl: 'https://hubspot.internal',
      timeoutMs: 3000,
      resolveAuthHeaders: () => Promise.reject(new Error('secret missing')),
      httpClient: () =>
        Promise.resolve({
          status: 200,
          text: () => Promise.resolve('ok'),
        }),
    });

    await expect(
      client({
        messageId: 'msg-1',
        payload: {
          eventType: 'customer.persisted',
          sourceId: 'source-1',
          tenantId: 'tenant-acme',
          correlationId: 'exec-1',
          publishedAt: '2026-03-04T10:00:00.000Z',
          customer: { id: 1 },
        },
      }),
    ).rejects.toBeInstanceOf(IntegrationExternalApiAuthError);
  });
});
