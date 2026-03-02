import { describe, expect, it } from '@jest/globals';

import { handler } from '../../../src/handlers/scheduler';

describe('scheduler handler', () => {
  it('returns expected payload', async () => {
    const result = await handler();

    expect(result.sourceIds).toEqual([]);
    expect(typeof result.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });
});
