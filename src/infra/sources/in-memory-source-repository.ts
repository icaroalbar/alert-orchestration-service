import type {
  ListActiveSourcesResult,
  SourceRepository,
} from '../../domain/scheduler/list-eligible-sources';

export interface InMemorySource {
  sourceId: string;
  nextRunAt: string;
  active?: boolean;
}

interface InMemoryPaginationToken {
  offset: number;
}

const encodeToken = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset } satisfies InMemoryPaginationToken), 'utf-8').toString(
    'base64url',
  );

const decodeToken = (token: string): InMemoryPaginationToken => {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Invalid token');
    }

    const record = parsed as Record<string, unknown>;
    if (!Number.isInteger(record.offset) || (record.offset as number) < 0) {
      throw new Error('Invalid offset');
    }

    return {
      offset: record.offset as number,
    };
  } catch {
    throw new Error('Invalid in-memory source pagination token.');
  }
};

const resolvePage = (
  items: InMemorySource[],
  limit: number,
  nextToken?: string,
): ListActiveSourcesResult => {
  const offset = nextToken ? decodeToken(nextToken).offset : 0;
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;

  return {
    items: pageItems.map((item) => ({
      sourceId: item.sourceId,
      nextRunAt: item.nextRunAt,
    })),
    nextToken: nextOffset < items.length ? encodeToken(nextOffset) : null,
  };
};

export function createInMemorySourceRepository(seed: InMemorySource[] = []): SourceRepository {
  const activeItems = seed
    .filter((item) => item.active !== false)
    .map((item) => ({
      sourceId: item.sourceId,
      nextRunAt: item.nextRunAt,
      active: true,
    }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  return {
    listActiveSources(params): Promise<ListActiveSourcesResult> {
      return Promise.resolve(resolvePage(activeItems, params.limit, params.nextToken));
    },
  };
}
