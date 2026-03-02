import type { SourceRepository } from '../../domain/scheduler/list-eligible-sources';

export interface InMemorySource {
  sourceId: string;
}

export function createInMemorySourceRepository(
  seed: InMemorySource[] = []
): SourceRepository {
  return {
    async listEligibleSourceIds(): Promise<string[]> {
      return seed.map((source) => source.sourceId);
    }
  };
}
