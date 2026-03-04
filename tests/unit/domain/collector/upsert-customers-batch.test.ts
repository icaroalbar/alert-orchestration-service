import { describe, expect, it } from '@jest/globals';

import {
  UpsertCustomersBatchApiError,
  createUpsertCustomersBatchClient,
} from '../../../../src/domain/collector/upsert-customers-batch';

describe('createUpsertCustomersBatchClient', () => {
  it('maps partial success response into persisted and rejected records with auth headers', async () => {
    const requests: Array<{ headers: Record<string, string> }> = [];
    const httpClient = (request: {
      headers: Record<string, string>;
    }) => {
      requests.push(request);
      return Promise.resolve({
      status: 200,
      json: () =>
        Promise.resolve({
        results: [
          { id: '1', status: 'UPSERTED' },
          { id: '2', status: 'REJECTED', reason: 'invalid_document' },
        ],
      }),
      text: () => Promise.resolve(''),
      });
    };

    const client = createUpsertCustomersBatchClient({
      endpointUrl: 'https://official-api.internal/upsert-batch',
      timeoutMs: 3000,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 10,
        backoffRate: 2,
      },
      httpClient,
      resolveAuthHeaders: () =>
        Promise.resolve({
          Authorization: 'Bearer token-123',
          'x-api-key': 'key-123',
        }),
    });

    const result = await client({
      sourceId: 'source-1',
      correlationId: 'exec-1',
      records: [
        { id: 1, email: 'a@example.com' },
        { id: 2, email: 'b@example.com' },
      ],
    });

    expect(result.persistedRecords).toEqual([{ id: 1, email: 'a@example.com' }]);
    expect(result.rejectedRecords).toEqual([
      {
        record: { id: 2, email: 'b@example.com' },
        reason: 'invalid_document',
      },
    ]);
    expect(result.attempts).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer token-123',
        'x-api-key': 'key-123',
      },
    });
  });

  it('retries transient status codes and succeeds in a later attempt', async () => {
    const statuses = [503, 429, 200];
    let callCount = 0;
    const delays: number[] = [];

    const client = createUpsertCustomersBatchClient({
      endpointUrl: 'https://official-api.internal/upsert-batch',
      timeoutMs: 3000,
      retryPolicy: {
        maxAttempts: 4,
        baseDelayMs: 50,
        backoffRate: 2,
      },
      httpClient: () => {
        const status = statuses[callCount];
        callCount += 1;
        if (status === 200) {
          return Promise.resolve({
            status,
            json: () => Promise.resolve({ results: [{ id: '1', status: 'UPSERTED' }] }),
            text: () => Promise.resolve(''),
          });
        }

        return Promise.resolve({
          status,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(`temporary failure ${status}`),
        });
      },
      sleep: (delayMs) => {
        delays.push(delayMs);
        return Promise.resolve();
      },
      nowMs: (() => {
        let current = 1000;
        return () => {
          current += 10;
          return current;
        };
      })(),
    });

    const result = await client({
      sourceId: 'source-1',
      correlationId: 'exec-1',
      records: [{ id: 1, email: 'a@example.com' }],
    });

    expect(callCount).toBe(3);
    expect(delays).toEqual([50, 100]);
    expect(result.attempts).toBe(3);
    expect(result.persistedRecords).toEqual([{ id: 1, email: 'a@example.com' }]);
  });

  it('fails without retry on non-transient status code', async () => {
    const client = createUpsertCustomersBatchClient({
      endpointUrl: 'https://official-api.internal/upsert-batch',
      timeoutMs: 3000,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 10,
        backoffRate: 2,
      },
      httpClient: () =>
        Promise.resolve({
        status: 400,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('invalid payload'),
      }),
      sleep: () => Promise.resolve(),
    });

    await expect(
      client({
        sourceId: 'source-1',
        correlationId: 'exec-1',
        records: [{ id: 1 }],
      }),
    ).rejects.toBeInstanceOf(UpsertCustomersBatchApiError);
  });

  it('fails with controlled error when auth headers cannot be resolved', async () => {
    const client = createUpsertCustomersBatchClient({
      endpointUrl: 'https://official-api.internal/upsert-batch',
      timeoutMs: 3000,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 10,
        backoffRate: 2,
      },
      resolveAuthHeaders: () => Promise.reject(new Error('missing outbound secret')),
      httpClient: () =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ results: [] }),
          text: () => Promise.resolve(''),
        }),
    });

    await expect(
      client({
        sourceId: 'source-1',
        correlationId: 'exec-1',
        records: [{ id: 1 }],
      }),
    ).rejects.toThrow('Official API outbound auth resolution failed: missing outbound secret');
  });
});
