import { describe, expect, it } from '@jest/globals';

import { createStructuredLogger } from '../../../../src/shared/logging/structured-logger';

describe('createStructuredLogger', () => {
  it('prints JSON with base metadata and context', () => {
    const calls: string[] = [];
    const logger = createStructuredLogger({
      component: 'scheduler',
      now: () => '2026-03-04T12:00:00.000Z',
      sink: {
        info: (message: string) => {
          calls.push(message);
        },
      },
    });

    logger.info('scheduler.eligible_sources.filtered', {
      eligibleSources: 3,
      correlationId: 'exec-123',
      optional: undefined,
    });

    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0] ?? '{}')).toEqual({
      level: 'INFO',
      timestamp: '2026-03-04T12:00:00.000Z',
      component: 'scheduler',
      event: 'scheduler.eligible_sources.filtered',
      eligibleSources: 3,
      correlationId: 'exec-123',
    });
  });
});
