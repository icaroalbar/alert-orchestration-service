import { describe, expect, it } from '@jest/globals';

import { resolveCorrelationId } from '../../../../src/shared/logging/correlation-id';

describe('resolveCorrelationId', () => {
  it('prioritizes correlation header', () => {
    const result = resolveCorrelationId({
      headers: {
        'X-Correlation-Id': 'corr-001',
      },
      requestId: 'req-001',
    });

    expect(result).toBe('corr-001');
  });

  it('falls back to requestId when header is missing', () => {
    const result = resolveCorrelationId({
      headers: {},
      requestId: 'req-002',
    });

    expect(result).toBe('req-002');
  });

  it('returns null when no value exists', () => {
    const result = resolveCorrelationId({
      headers: {},
    });

    expect(result).toBeNull();
  });
});
