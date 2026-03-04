import { calculateNextRunAt, type NextRunSchedule } from '../sources/next-run-at';

/**
 * Domain use-case for loading active sources from the registry in a paginated way.
 * Infrastructure details are hidden behind the repository contract.
 */
interface SchedulerSourceBase {
  sourceId: string;
  nextRunAt: string;
}

interface SchedulerSourceInterval extends SchedulerSourceBase {
  scheduleType: 'interval';
  intervalMinutes: number;
  cronExpr?: undefined;
}

interface SchedulerSourceCron extends SchedulerSourceBase {
  scheduleType: 'cron';
  intervalMinutes?: undefined;
  cronExpr: string;
}

export type SchedulerSource = SchedulerSourceInterval | SchedulerSourceCron;

export interface ListActiveSourcesParams {
  limit: number;
  nextToken?: string;
  now?: string;
}

export interface ListActiveSourcesResult {
  items: SchedulerSource[];
  nextToken: string | null;
}

export interface ReserveNextRunParams {
  sourceId: string;
  expectedNextRunAt: string;
  nextRunAt: string;
  reservedAt: string;
}

export interface SourceRepository {
  listActiveSources(params: ListActiveSourcesParams): Promise<ListActiveSourcesResult>;
  reserveNextRun(params: ReserveNextRunParams): Promise<boolean>;
}

export interface ListEligibleSourcesInput {
  sourceRepository: SourceRepository;
  pageSize: number;
  now?: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isIsoDateTime = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const resolveReferenceNow = (rawNow?: string): { iso: string; timestamp: number } => {
  const normalizedNow = rawNow?.trim();
  const now = normalizedNow && normalizedNow.length > 0 ? normalizedNow : new Date().toISOString();

  if (!isIsoDateTime(now)) {
    throw new Error('Invalid scheduler reference time: now must use ISO-8601 UTC format.');
  }

  return {
    iso: now,
    timestamp: Date.parse(now),
  };
};

const normalizeSchedulerSource = (source: SchedulerSource): SchedulerSource => {
  if (!isNonEmptyString(source.sourceId)) {
    throw new Error('Invalid scheduler source record: sourceId is required.');
  }

  if (!isNonEmptyString(source.nextRunAt) || !isIsoDateTime(source.nextRunAt.trim())) {
    throw new Error(
      'Invalid scheduler source record: nextRunAt must use ISO-8601 UTC format.',
    );
  }

  const sourceId = source.sourceId.trim();
  const nextRunAt = source.nextRunAt.trim();

  if (source.scheduleType === 'interval') {
    if (!isPositiveInteger(source.intervalMinutes)) {
      throw new Error(
        'Invalid scheduler source record: intervalMinutes must be a positive integer.',
      );
    }

    return {
      sourceId,
      nextRunAt,
      scheduleType: 'interval',
      intervalMinutes: source.intervalMinutes,
    };
  }

  if (source.scheduleType === 'cron') {
    if (!isNonEmptyString(source.cronExpr)) {
      throw new Error(
        'Invalid scheduler source record: cronExpr is required when scheduleType=cron.',
      );
    }

    return {
      sourceId,
      nextRunAt,
      scheduleType: 'cron',
      cronExpr: source.cronExpr.trim(),
    };
  }

  throw new Error('Invalid scheduler source record: scheduleType must be "interval" or "cron".');
};

const toNextRunSchedule = (source: SchedulerSource): NextRunSchedule => {
  if (source.scheduleType === 'interval') {
    return {
      scheduleType: 'interval',
      intervalMinutes: source.intervalMinutes,
    };
  }

  return {
    scheduleType: 'cron',
    cronExpr: source.cronExpr,
  };
};

export async function listEligibleSources({
  sourceRepository,
  pageSize,
  now,
}: ListEligibleSourcesInput): Promise<SchedulerSource[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('pageSize must be an integer greater than zero.');
  }

  const referenceNow = resolveReferenceNow(now);
  const collected: SchedulerSource[] = [];
  const seen = new Set<string>();
  let nextToken: string | undefined;

  do {
    const page = await sourceRepository.listActiveSources({
      limit: pageSize,
      nextToken,
      now: referenceNow.iso,
    });

    for (const item of page.items) {
      const normalized = normalizeSchedulerSource(item);
      const nextRunAtTimestamp = Date.parse(normalized.nextRunAt);

      if (nextRunAtTimestamp > referenceNow.timestamp) {
        continue;
      }

      if (seen.has(normalized.sourceId)) {
        continue;
      }

      seen.add(normalized.sourceId);
      const calculatedNextRunAt = calculateNextRunAt(toNextRunSchedule(normalized), referenceNow.iso);
      if (!calculatedNextRunAt.success) {
        throw new Error(
          `Invalid scheduler source record: unable to calculate nextRunAt for source "${normalized.sourceId}".`,
        );
      }

      const reserved = await sourceRepository.reserveNextRun({
        sourceId: normalized.sourceId,
        expectedNextRunAt: normalized.nextRunAt,
        nextRunAt: calculatedNextRunAt.value,
        reservedAt: referenceNow.iso,
      });
      if (!reserved) {
        continue;
      }

      collected.push(normalized);
    }

    nextToken = page.nextToken ?? undefined;
  } while (nextToken);

  return collected;
}
