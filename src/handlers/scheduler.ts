import type { SourceRepository } from '../domain/scheduler/list-eligible-sources';
import { listEligibleSources } from '../domain/scheduler/list-eligible-sources';
import { createDynamoDbSchedulerSourceRepository } from '../infra/sources/dynamodb-scheduler-source-repository';
import { nowIso } from '../shared/time/now-iso';

const MAP_MAX_CONCURRENCY_DEFAULT = 5;
const MAP_MAX_CONCURRENCY_MIN = 1;
const MAP_MAX_CONCURRENCY_MAX = 40;
const ACTIVE_SOURCES_PAGE_SIZE_DEFAULT = 100;
const ACTIVE_SOURCES_PAGE_SIZE_MIN = 1;
const ACTIVE_SOURCES_PAGE_SIZE_MAX = 200;

export interface SchedulerEvent {
  now?: string;
}

export interface SchedulerResult {
  sourceIds: string[];
  generatedAt: string;
  maxConcurrency: number;
}

export interface SchedulerDependencies {
  sourceRepository: SourceRepository;
  now: () => string;
  activeSourcesPageSize: number;
}

let cachedDefaultDependencies: SchedulerDependencies | undefined;

const resolveMapMaxConcurrency = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return MAP_MAX_CONCURRENCY_DEFAULT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  const isValidInteger = Number.isInteger(parsed);
  const isInRange = parsed >= MAP_MAX_CONCURRENCY_MIN && parsed <= MAP_MAX_CONCURRENCY_MAX;

  if (!isValidInteger || !isInRange) {
    throw new Error(
      `Invalid MAP_MAX_CONCURRENCY="${rawValue}". Expected integer between ${MAP_MAX_CONCURRENCY_MIN} and ${MAP_MAX_CONCURRENCY_MAX}.`,
    );
  }

  return parsed;
};

const resolveActiveSourcesPageSize = (rawValue: string | undefined): number => {
  if (!rawValue) {
    return ACTIVE_SOURCES_PAGE_SIZE_DEFAULT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  const isValidInteger = Number.isInteger(parsed);
  const isInRange = parsed >= ACTIVE_SOURCES_PAGE_SIZE_MIN && parsed <= ACTIVE_SOURCES_PAGE_SIZE_MAX;

  if (!isValidInteger || !isInRange) {
    throw new Error(
      `Invalid SCHEDULER_ACTIVE_SOURCES_PAGE_SIZE="${rawValue}". Expected integer between ${ACTIVE_SOURCES_PAGE_SIZE_MIN} and ${ACTIVE_SOURCES_PAGE_SIZE_MAX}.`,
    );
  }

  return parsed;
};

const getDefaultDependencies = (): SchedulerDependencies => {
  if (cachedDefaultDependencies) {
    return cachedDefaultDependencies;
  }

  const tableName = process.env.SOURCES_TABLE_NAME;
  if (!tableName || tableName.trim().length === 0) {
    throw new Error('SOURCES_TABLE_NAME is required.');
  }

  cachedDefaultDependencies = {
    sourceRepository: createDynamoDbSchedulerSourceRepository({
      tableName,
      activeIndexName: process.env.SOURCES_ACTIVE_NEXT_RUN_AT_INDEX_NAME,
    }),
    now: nowIso,
    activeSourcesPageSize: resolveActiveSourcesPageSize(
      process.env.SCHEDULER_ACTIVE_SOURCES_PAGE_SIZE,
    ),
  };

  return cachedDefaultDependencies;
};

export const createHandler =
  ({ sourceRepository, now, activeSourcesPageSize }: SchedulerDependencies) =>
  async (event: SchedulerEvent = {}): Promise<SchedulerResult> => {
    const generatedAt = now();
    const referenceNow = event.now ?? generatedAt;
    const sources = await listEligibleSources({
      sourceRepository,
      now: referenceNow,
      pageSize: activeSourcesPageSize,
    });

    const sourceIds = sources.map((source) => source.sourceId);
    const maxConcurrency = resolveMapMaxConcurrency(process.env.MAP_MAX_CONCURRENCY);
    console.info('scheduler.eligible_sources.filtered', {
      referenceNow,
      eligibleSources: sourceIds.length,
    });

    return {
      sourceIds,
      generatedAt,
      maxConcurrency,
    };
  };

export async function handler(event: SchedulerEvent = {}): Promise<SchedulerResult> {
  return createHandler(getDefaultDependencies())(event);
}
