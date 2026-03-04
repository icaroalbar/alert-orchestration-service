import { describe, expect, it } from '@jest/globals';

import { calculateNextRunAt } from '../../../../src/domain/sources/next-run-at';

describe('next-run-at', () => {
  it('calculates next run for interval schedule', () => {
    const result = calculateNextRunAt(
      {
        scheduleType: 'interval',
        intervalMinutes: 30,
      },
      '2026-03-03T12:00:00.000Z',
    );

    expect(result).toEqual({
      success: true,
      value: '2026-03-03T12:30:00.000Z',
    });
  });

  it('calculates next run for cron schedule in UTC', () => {
    const result = calculateNextRunAt(
      {
        scheduleType: 'cron',
        cronExpr: '0 */10 * * * *',
      },
      '2026-03-03T12:00:00.000Z',
    );

    expect(result).toEqual({
      success: true,
      value: '2026-03-03T12:10:00.000Z',
    });
  });

  it('returns validation error for invalid cron expression', () => {
    const result = calculateNextRunAt(
      {
        scheduleType: 'cron',
        cronExpr: 'invalid cron',
      },
      '2026-03-03T12:00:00.000Z',
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'cronExpr',
        code: 'INVALID_FORMAT',
      }),
    );
  });

  it('returns validation error for invalid reference time', () => {
    const result = calculateNextRunAt(
      {
        scheduleType: 'interval',
        intervalMinutes: 30,
      },
      'invalid-date',
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: '$',
        code: 'INVALID_VALUE',
      }),
    );
  });
});
