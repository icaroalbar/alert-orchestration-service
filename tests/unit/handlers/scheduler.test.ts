import { afterEach, describe, expect, it } from '@jest/globals';

import { handler } from '../../../src/handlers/scheduler';

const ORIGINAL_MAP_MAX_CONCURRENCY = process.env.MAP_MAX_CONCURRENCY;

afterEach(() => {
  if (ORIGINAL_MAP_MAX_CONCURRENCY === undefined) {
    delete process.env.MAP_MAX_CONCURRENCY;
    return;
  }

  process.env.MAP_MAX_CONCURRENCY = ORIGINAL_MAP_MAX_CONCURRENCY;
});

describe('scheduler handler', () => {
  it('returns expected payload with default max concurrency', async () => {
    delete process.env.MAP_MAX_CONCURRENCY;
    const result = await handler();

    expect(result.sourceIds).toEqual([]);
    expect(typeof result.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
    expect(result.maxConcurrency).toBe(5);
  });

  it('returns configured max concurrency from environment', async () => {
    process.env.MAP_MAX_CONCURRENCY = '12';

    const result = await handler();

    expect(result.maxConcurrency).toBe(12);
  });

  it('throws on invalid MAP_MAX_CONCURRENCY', async () => {
    process.env.MAP_MAX_CONCURRENCY = '0';

    await expect(handler()).rejects.toThrow(
      'Invalid MAP_MAX_CONCURRENCY="0". Expected integer between 1 and 40.',
    );
  });
});
