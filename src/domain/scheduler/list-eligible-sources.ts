/**
 * Domain use-case for loading source IDs that can run in the current tick.
 * Infrastructure details are hidden behind the repository contract.
 */
export interface SourceRepository {
  listEligibleSourceIds(params: { now?: string }): Promise<string[]>;
}

export interface ListEligibleSourcesInput {
  sourceRepository: SourceRepository;
  now?: string;
}

export async function listEligibleSources({
  sourceRepository,
  now,
}: ListEligibleSourcesInput): Promise<string[]> {
  return sourceRepository.listEligibleSourceIds({ now });
}
