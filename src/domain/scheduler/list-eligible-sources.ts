/**
 * Domain use-case for loading active sources from the registry in a paginated way.
 * Infrastructure details are hidden behind the repository contract.
 */
export interface SchedulerSource {
  sourceId: string;
  nextRunAt: string;
}

export interface ListActiveSourcesParams {
  limit: number;
  nextToken?: string;
  now?: string;
}

export interface ListActiveSourcesResult {
  items: SchedulerSource[];
  nextToken: string | null;
}

export interface SourceRepository {
  listActiveSources(params: ListActiveSourcesParams): Promise<ListActiveSourcesResult>;
}

export interface ListEligibleSourcesInput {
  sourceRepository: SourceRepository;
  pageSize: number;
  now?: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isIsoDateTime = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const normalizeSchedulerSource = (source: SchedulerSource): SchedulerSource => {
  if (!isNonEmptyString(source.sourceId)) {
    throw new Error('Invalid scheduler source record: sourceId is required.');
  }

  if (!isNonEmptyString(source.nextRunAt) || !isIsoDateTime(source.nextRunAt.trim())) {
    throw new Error(
      'Invalid scheduler source record: nextRunAt must use ISO-8601 UTC format.',
    );
  }

  return {
    sourceId: source.sourceId.trim(),
    nextRunAt: source.nextRunAt.trim(),
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

  const collected: SchedulerSource[] = [];
  const seen = new Set<string>();
  let nextToken: string | undefined;

  do {
    const page = await sourceRepository.listActiveSources({
      limit: pageSize,
      nextToken,
      now,
    });

    for (const item of page.items) {
      const normalized = normalizeSchedulerSource(item);
      if (seen.has(normalized.sourceId)) {
        continue;
      }

      seen.add(normalized.sourceId);
      collected.push(normalized);
    }

    nextToken = page.nextToken ?? undefined;
  } while (nextToken);

  return collected;
}
