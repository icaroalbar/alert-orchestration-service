import type {
  ListActiveSourcesResult,
  SchedulerSource,
  SourceRepository,
} from '../../domain/scheduler/list-eligible-sources';

interface InMemorySourceBase {
  sourceId: string;
  nextRunAt: string;
  active?: boolean;
}

interface InMemorySourceInterval extends InMemorySourceBase {
  scheduleType: 'interval';
  intervalMinutes: number;
  cronExpr?: undefined;
}

interface InMemorySourceCron extends InMemorySourceBase {
  scheduleType: 'cron';
  intervalMinutes?: undefined;
  cronExpr: string;
}

export type InMemorySource = InMemorySourceInterval | InMemorySourceCron;

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

  const toSchedulerSource = (item: InMemorySource): SchedulerSource => {
    if (item.scheduleType === 'interval') {
      return {
        sourceId: item.sourceId,
        nextRunAt: item.nextRunAt,
        scheduleType: 'interval',
        intervalMinutes: item.intervalMinutes,
      };
    }

    return {
      sourceId: item.sourceId,
      nextRunAt: item.nextRunAt,
      scheduleType: 'cron',
      cronExpr: item.cronExpr,
    };
  };

  return {
    items: pageItems.map((item) => toSchedulerSource(item)),
    nextToken: nextOffset < items.length ? encodeToken(nextOffset) : null,
  };
};

export function createInMemorySourceRepository(seed: InMemorySource[] = []): SourceRepository {
  const activeItems = seed
    .filter((item) => item.active !== false)
    .map((item) =>
      item.scheduleType === 'interval'
        ? {
            sourceId: item.sourceId,
            nextRunAt: item.nextRunAt,
            active: true,
            scheduleType: 'interval' as const,
            intervalMinutes: item.intervalMinutes,
          }
        : {
            sourceId: item.sourceId,
            nextRunAt: item.nextRunAt,
            active: true,
            scheduleType: 'cron' as const,
            cronExpr: item.cronExpr,
          },
    )
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  return {
    listActiveSources(params): Promise<ListActiveSourcesResult> {
      return Promise.resolve(resolvePage(activeItems, params.limit, params.nextToken));
    },
    reserveNextRun(params): Promise<boolean> {
      const source = activeItems.find((item) => item.sourceId === params.sourceId);
      if (!source) {
        return Promise.resolve(false);
      }

      if (source.nextRunAt !== params.expectedNextRunAt) {
        return Promise.resolve(false);
      }

      source.nextRunAt = params.nextRunAt;
      return Promise.resolve(true);
    },
  };
}
