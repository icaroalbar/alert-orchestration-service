import { describe, expect, it } from '@jest/globals';

import { handler } from '../../../src/handlers/collector';

describe('collector handler', () => {
  it('returns standardized result for a valid sourceId', async () => {
    const result = await handler({ sourceId: 'source-acme' });

    expect(result.sourceId).toBe('source-acme');
    expect(result.recordsSent).toBe(0);
    expect(typeof result.processedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.processedAt))).toBe(false);
  });

  it('throws when sourceId is missing', () => {
    expect(() => handler({ sourceId: '' })).toThrow(
      'sourceId is required for collector execution.',
    );
  });
});
