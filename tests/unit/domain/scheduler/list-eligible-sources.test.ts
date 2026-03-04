import { describe, expect, it } from '@jest/globals';

import {
  listEligibleSources,
  type ListActiveSourcesParams,
  type ListActiveSourcesResult,
  type SourceRepository,
} from '../../../../src/domain/scheduler/list-eligible-sources';

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

describe('listEligibleSources', () => {
  it('loads all pages, forwards now reference and keeps only nextRunAt <= now', async () => {
    const repository = new SpySourceRepository([
      {
        items: [{ sourceId: 'source-a', nextRunAt: '2026-03-04T09:00:00.000Z' }],
        nextToken: 'page-2',
      },
      {
        items: [{ sourceId: 'source-b', nextRunAt: '2026-03-04T09:05:00.000Z' }],
        nextToken: null,
      },
    ]);

    const result = await listEligibleSources({
      sourceRepository: repository,
      pageSize: 1,
      now: '2026-03-04T09:01:00.000Z',
    });

    expect(repository.calls).toEqual([
      { limit: 1, nextToken: undefined, now: '2026-03-04T09:01:00.000Z' },
      { limit: 1, nextToken: 'page-2', now: '2026-03-04T09:01:00.000Z' },
    ]);
    expect(result).toEqual([{ sourceId: 'source-a', nextRunAt: '2026-03-04T09:00:00.000Z' }]);
  });

  it('deduplicates repeated sourceIds across pages after eligibility filtering', async () => {
    const repository = new SpySourceRepository([
      {
        items: [{ sourceId: 'source-a', nextRunAt: '2026-03-04T08:55:00.000Z' }],
        nextToken: 'page-2',
      },
      {
        items: [
          { sourceId: 'source-a', nextRunAt: '2026-03-04T08:55:00.000Z' },
          { sourceId: 'source-b', nextRunAt: '2026-03-04T09:10:00.000Z' },
        ],
        nextToken: null,
      },
    ]);

    const result = await listEligibleSources({
      sourceRepository: repository,
      pageSize: 1,
      now: '2026-03-04T09:00:00.000Z',
    });

    expect(result).toEqual([{ sourceId: 'source-a', nextRunAt: '2026-03-04T08:55:00.000Z' }]);
  });

  it('throws when repository returns invalid normalized source', async () => {
    const repository = new SpySourceRepository([
      {
        items: [{ sourceId: '', nextRunAt: '2026-03-04T09:00:00.000Z' }],
        nextToken: null,
      },
    ]);

    await expect(
      listEligibleSources({
        sourceRepository: repository,
        pageSize: 1,
      }),
    ).rejects.toThrow('Invalid scheduler source record: sourceId is required.');
  });

  it('throws for invalid page size', async () => {
    const repository = new SpySourceRepository([{ items: [], nextToken: null }]);

    await expect(
      listEligibleSources({
        sourceRepository: repository,
        pageSize: 0,
      }),
    ).rejects.toThrow('pageSize must be an integer greater than zero.');
  });

  it('throws when now is not a valid UTC ISO-8601 timestamp', async () => {
    const repository = new SpySourceRepository([{ items: [], nextToken: null }]);

    await expect(
      listEligibleSources({
        sourceRepository: repository,
        pageSize: 1,
        now: '2026-03-04T09:00:00',
      }),
    ).rejects.toThrow('Invalid scheduler reference time: now must use ISO-8601 UTC format.');
  });
});
