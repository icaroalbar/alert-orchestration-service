import { CronExpressionParser } from 'cron-parser';

import type { SourceSchemaValidationError } from './source-schema';

export type NextRunSchedule =
  | {
      scheduleType: 'interval';
      intervalMinutes: number;
      cronExpr?: undefined;
    }
  | {
      scheduleType: 'cron';
      intervalMinutes?: undefined;
      cronExpr: string;
    };

const invalidNowError = (): SourceSchemaValidationError => ({
  field: '$',
  code: 'INVALID_VALUE',
  message: 'Unable to compute nextRunAt from current reference time.',
});

const invalidCronError = (): SourceSchemaValidationError => ({
  field: 'cronExpr',
  code: 'INVALID_FORMAT',
  message: 'cronExpr must be a valid cron expression.',
});

export const calculateNextRunAt = (
  schedule: NextRunSchedule,
  referenceIso: string,
):
  | {
      success: true;
      value: string;
    }
  | {
      success: false;
      errors: SourceSchemaValidationError[];
    } => {
  const referenceDate = new Date(referenceIso);
  if (Number.isNaN(referenceDate.getTime())) {
    return {
      success: false,
      errors: [invalidNowError()],
    };
  }

  if (schedule.scheduleType === 'interval') {
    return {
      success: true,
      value: new Date(referenceDate.getTime() + schedule.intervalMinutes * 60_000).toISOString(),
    };
  }

  try {
    const interval = CronExpressionParser.parse(schedule.cronExpr.trim(), {
      currentDate: referenceDate,
      tz: 'UTC',
    });

    return {
      success: true,
      value: interval.next().toDate().toISOString(),
    };
  } catch {
    return {
      success: false,
      errors: [invalidCronError()],
    };
  }
};
