import type { SourceRepository } from '../../domain/scheduler/list-eligible-sources';

export interface InMemorySource {
  sourceId: string;
}

export function createInMemorySourceRepository(seed: InMemorySource[] = []): SourceRepository {
  return {
    listEligibleSourceIds(): Promise<string[]> {
      return Promise.resolve(seed.map((source) => source.sourceId));
    },
  };
}
