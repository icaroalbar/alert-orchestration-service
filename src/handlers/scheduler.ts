import { listEligibleSources } from '../domain/scheduler/list-eligible-sources';
import { createInMemorySourceRepository } from '../infra/sources/in-memory-source-repository';
import { nowIso } from '../shared/time/now-iso';

export interface SchedulerEvent {
  now?: string;
}

export interface SchedulerResult {
  sourceIds: string[];
  generatedAt: string;
}

export async function handler(event: SchedulerEvent = {}): Promise<SchedulerResult> {
  const sourceRepository = createInMemorySourceRepository();
  const sourceIds = await listEligibleSources({
    sourceRepository,
    now: event.now
  });

  return {
    sourceIds,
    generatedAt: nowIso()
  };
}
