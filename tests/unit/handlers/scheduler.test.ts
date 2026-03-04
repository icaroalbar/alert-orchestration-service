import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type {
  ListActiveSourcesParams,
  ListActiveSourcesResult,
  SourceRepository,
} from '../../../src/domain/scheduler/list-eligible-sources';
import { createHandler } from '../../../src/handlers/scheduler';

const ORIGINAL_MAP_MAX_CONCURRENCY = process.env.MAP_MAX_CONCURRENCY;

class SpySourceRepository implements SourceRepository {
  public readonly calls: ListActiveSourcesParams[] = [];
  private readonly pages: ListActiveSourcesResult[];

  constructor(pages: ListActiveSourcesResult[]) {
    this.pages = pages;
  }

  listActiveSources(params: ListActiveSourcesParams): Promise<ListActiveSourcesResult> {
    this.calls.push(params);
    return Promise.resolve(this.pages[this.calls.length - 1] ?? { items: [], nextToken: null });
  }
}

afterEach(() => {
  jest.restoreAllMocks();

  if (ORIGINAL_MAP_MAX_CONCURRENCY === undefined) {
    delete process.env.MAP_MAX_CONCURRENCY;
    return;
  }

  process.env.MAP_MAX_CONCURRENCY = ORIGINAL_MAP_MAX_CONCURRENCY;
});

describe('scheduler handler', () => {
  it('returns only eligible sourceIds and logs filtered count with default max concurrency', async () => {
    delete process.env.MAP_MAX_CONCURRENCY;
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const repository = new SpySourceRepository([
      {
        items: [
          { sourceId: 'source-b', nextRunAt: '2026-03-04T09:00:00.000Z' },
          { sourceId: 'source-a', nextRunAt: '2026-03-04T09:05:00.000Z' },
        ],
        nextToken: 'page-2',
      },
      {
        items: [{ sourceId: 'source-c', nextRunAt: '2026-03-04T08:59:00.000Z' }],
        nextToken: null,
      },
    ]);

    const handler = createHandler({
      sourceRepository: repository,
      now: () => '2026-03-04T10:00:00.000Z',
      activeSourcesPageSize: 2,
    });

    const result = await handler({
      now: '2026-03-04T09:01:00.000Z',
    });

    expect(repository.calls).toEqual([
      {
        limit: 2,
        nextToken: undefined,
        now: '2026-03-04T09:01:00.000Z',
      },
      {
        limit: 2,
        nextToken: 'page-2',
        now: '2026-03-04T09:01:00.000Z',
      },
    ]);
    expect(result.sourceIds).toEqual(['source-b', 'source-c']);
    expect(result.generatedAt).toBe('2026-03-04T10:00:00.000Z');
    expect(result.maxConcurrency).toBe(5);
    expect(infoSpy).toHaveBeenCalledWith('scheduler.eligible_sources.filtered', {
      referenceNow: '2026-03-04T09:01:00.000Z',
      eligibleSources: 2,
    });
  });

  it('returns configured max concurrency from environment', async () => {
    process.env.MAP_MAX_CONCURRENCY = '12';

    const repository = new SpySourceRepository([{ items: [], nextToken: null }]);
    const handler = createHandler({
      sourceRepository: repository,
      now: () => '2026-03-04T10:00:00.000Z',
      activeSourcesPageSize: 10,
    });

    const result = await handler();

    expect(result.maxConcurrency).toBe(12);
  });

  it('uses generatedAt as reference now when event.now is omitted', async () => {
    delete process.env.MAP_MAX_CONCURRENCY;
    const repository = new SpySourceRepository([
      {
        items: [
          { sourceId: 'source-a', nextRunAt: '2026-03-04T10:00:00.000Z' },
          { sourceId: 'source-b', nextRunAt: '2026-03-04T10:01:00.000Z' },
        ],
        nextToken: null,
      },
    ]);
    const handler = createHandler({
      sourceRepository: repository,
      now: () => '2026-03-04T10:00:00.000Z',
      activeSourcesPageSize: 10,
    });

    const result = await handler();

    expect(repository.calls).toEqual([
      {
        limit: 10,
        nextToken: undefined,
        now: '2026-03-04T10:00:00.000Z',
      },
    ]);
    expect(result.generatedAt).toBe('2026-03-04T10:00:00.000Z');
    expect(result.sourceIds).toEqual(['source-a']);
  });

  it('throws on invalid MAP_MAX_CONCURRENCY', async () => {
    process.env.MAP_MAX_CONCURRENCY = '0';

    const repository = new SpySourceRepository([{ items: [], nextToken: null }]);
    const handler = createHandler({
      sourceRepository: repository,
      now: () => '2026-03-04T10:00:00.000Z',
      activeSourcesPageSize: 10,
    });

    await expect(handler()).rejects.toThrow(
      'Invalid MAP_MAX_CONCURRENCY="0". Expected integer between 1 and 40.',
    );
  });
});
