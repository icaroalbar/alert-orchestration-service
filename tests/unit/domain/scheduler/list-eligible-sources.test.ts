import { describe, expect, it } from '@jest/globals';

import {
  listEligibleSources,
  type ListActiveSourcesParams,
  type ListActiveSourcesResult,
  type ReserveNextRunParams,
  type SourceRepository,
} from '../../../../src/domain/scheduler/list-eligible-sources';

class SpySourceRepository implements SourceRepository {
  public readonly calls: ListActiveSourcesParams[] = [];
  public readonly reserveCalls: ReserveNextRunParams[] = [];
  private readonly pages: ListActiveSourcesResult[];
  private readonly reserveResults: boolean[];

  constructor(pages: ListActiveSourcesResult[], reserveResults: boolean[] = []) {
    this.pages = pages;
    this.reserveResults = reserveResults;
  }

  listActiveSources(params: ListActiveSourcesParams): Promise<ListActiveSourcesResult> {
    this.calls.push(params);
    return Promise.resolve(this.pages[this.calls.length - 1] ?? { items: [], nextToken: null });
  }

  reserveNextRun(params: ReserveNextRunParams): Promise<boolean> {
    this.reserveCalls.push(params);
    const result = this.reserveResults[this.reserveCalls.length - 1];
    return Promise.resolve(result ?? true);
  }
}

describe('listEligibleSources', () => {
  it('loads all pages, forwards now reference and reserves only nextRunAt <= now', async () => {
    const repository = new SpySourceRepository([
      {
        items: [
          {
            sourceId: 'source-a',
            nextRunAt: '2026-03-04T09:00:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
        ],
        nextToken: 'page-2',
      },
      {
        items: [
          {
            sourceId: 'source-b',
            nextRunAt: '2026-03-04T09:05:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
        ],
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
    expect(repository.reserveCalls).toEqual([
      {
        sourceId: 'source-a',
        expectedNextRunAt: '2026-03-04T09:00:00.000Z',
        nextRunAt: '2026-03-04T09:06:00.000Z',
        reservedAt: '2026-03-04T09:01:00.000Z',
      },
    ]);
    expect(result).toEqual([
      {
        sourceId: 'source-a',
        nextRunAt: '2026-03-04T09:00:00.000Z',
        scheduleType: 'interval',
        intervalMinutes: 5,
      },
    ]);
  });

  it('includes source when nextRunAt is exactly equal to now and reserves next run for cron schedule', async () => {
    const repository = new SpySourceRepository([
      {
        items: [
          {
            sourceId: 'source-cron',
            nextRunAt: '2026-03-04T09:00:00.000Z',
            scheduleType: 'cron',
            cronExpr: '*/5 * * * *',
          },
        ],
        nextToken: null,
      },
    ]);

    const result = await listEligibleSources({
      sourceRepository: repository,
      pageSize: 10,
      now: '2026-03-04T09:00:00.000Z',
    });

    expect(repository.reserveCalls).toEqual([
      {
        sourceId: 'source-cron',
        expectedNextRunAt: '2026-03-04T09:00:00.000Z',
        nextRunAt: '2026-03-04T09:05:00.000Z',
        reservedAt: '2026-03-04T09:00:00.000Z',
      },
    ]);
    expect(result).toEqual([
      {
        sourceId: 'source-cron',
        nextRunAt: '2026-03-04T09:00:00.000Z',
        scheduleType: 'cron',
        cronExpr: '*/5 * * * *',
      },
    ]);
  });

  it('deduplicates repeated sourceIds across pages before reservation', async () => {
    const repository = new SpySourceRepository([
      {
        items: [
          {
            sourceId: 'source-a',
            nextRunAt: '2026-03-04T08:55:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
        ],
        nextToken: 'page-2',
      },
      {
        items: [
          {
            sourceId: 'source-a',
            nextRunAt: '2026-03-04T08:55:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
          {
            sourceId: 'source-b',
            nextRunAt: '2026-03-04T09:10:00.000Z',
            scheduleType: 'cron',
            cronExpr: '*/5 * * * *',
          },
        ],
        nextToken: null,
      },
    ]);

    const result = await listEligibleSources({
      sourceRepository: repository,
      pageSize: 1,
      now: '2026-03-04T09:00:00.000Z',
    });

    expect(repository.reserveCalls).toHaveLength(1);
    expect(result).toEqual([
      {
        sourceId: 'source-a',
        nextRunAt: '2026-03-04T08:55:00.000Z',
        scheduleType: 'interval',
        intervalMinutes: 5,
      },
    ]);
  });

  it('skips source when conditional reservation conflicts', async () => {
    const repository = new SpySourceRepository(
      [
        {
          items: [
            {
              sourceId: 'source-a',
              nextRunAt: '2026-03-04T08:55:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            },
          ],
          nextToken: null,
        },
      ],
      [false],
    );

    const result = await listEligibleSources({
      sourceRepository: repository,
      pageSize: 1,
      now: '2026-03-04T09:00:00.000Z',
    });

    expect(repository.reserveCalls).toHaveLength(1);
    expect(result).toEqual([]);
  });

  it('throws when repository returns invalid normalized source', async () => {
    const repository = new SpySourceRepository([
      {
        items: [
          {
            sourceId: '',
            nextRunAt: '2026-03-04T09:00:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
        ],
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
