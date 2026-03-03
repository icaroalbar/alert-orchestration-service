import { listEligibleSources } from '../domain/scheduler/list-eligible-sources';
import { createInMemorySourceRepository } from '../infra/sources/in-memory-source-repository';
import { nowIso } from '../shared/time/now-iso';

const MAP_MAX_CONCURRENCY_DEFAULT = 5;
const MAP_MAX_CONCURRENCY_MIN = 1;
const MAP_MAX_CONCURRENCY_MAX = 40;

export interface SchedulerEvent {
  now?: string;
}

export interface SchedulerResult {
  sourceIds: string[];
  generatedAt: string;
  maxConcurrency: number;
}

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

export async function handler(event: SchedulerEvent = {}): Promise<SchedulerResult> {
  const sourceRepository = createInMemorySourceRepository();
  const sourceIds = await listEligibleSources({
    sourceRepository,
    now: event.now,
  });
  const maxConcurrency = resolveMapMaxConcurrency(process.env.MAP_MAX_CONCURRENCY);

  return {
    sourceIds,
    generatedAt: nowIso(),
    maxConcurrency,
  };
}
