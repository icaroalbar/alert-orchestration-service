import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type {
  ListActiveSourcesParams,
  ListActiveSourcesResult,
  ReserveNextRunParams,
  SourceRepository,
} from '../../../src/domain/scheduler/list-eligible-sources';
import { createHandler } from '../../../src/handlers/scheduler';

const ORIGINAL_MAP_MAX_CONCURRENCY = process.env.MAP_MAX_CONCURRENCY;

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

afterEach(() => {
  jest.restoreAllMocks();

  if (ORIGINAL_MAP_MAX_CONCURRENCY === undefined) {
    delete process.env.MAP_MAX_CONCURRENCY;
    return;
  }

  process.env.MAP_MAX_CONCURRENCY = ORIGINAL_MAP_MAX_CONCURRENCY;
});

describe('scheduler handler', () => {
  it('returns only reserved sourceIds and logs filtered count with default max concurrency', async () => {
    delete process.env.MAP_MAX_CONCURRENCY;
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const repository = new SpySourceRepository([
      {
        items: [
          {
            sourceId: 'source-b',
            nextRunAt: '2026-03-04T09:00:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
          {
            sourceId: 'source-a',
            nextRunAt: '2026-03-04T09:05:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
        ],
        nextToken: 'page-2',
      },
      {
        items: [
          {
            sourceId: 'source-c',
            nextRunAt: '2026-03-04T08:59:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
        ],
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
    expect(repository.reserveCalls).toEqual([
      {
        sourceId: 'source-b',
        expectedNextRunAt: '2026-03-04T09:00:00.000Z',
        nextRunAt: '2026-03-04T09:06:00.000Z',
        reservedAt: '2026-03-04T09:01:00.000Z',
      },
      {
        sourceId: 'source-c',
        expectedNextRunAt: '2026-03-04T08:59:00.000Z',
        nextRunAt: '2026-03-04T09:06:00.000Z',
        reservedAt: '2026-03-04T09:01:00.000Z',
      },
    ]);
    expect(result.sourceIds).toEqual(['source-b', 'source-c']);
    expect(result.contractVersion).toBe('scheduler-output.v1');
    expect(result.eligibleSources).toBe(2);
    expect(result.hasEligibleSources).toBe(true);
    expect(result.referenceNow).toBe('2026-03-04T09:01:00.000Z');
    expect(result.generatedAt).toBe('2026-03-04T10:00:00.000Z');
    expect(result.maxConcurrency).toBe(5);
    expect(infoSpy).toHaveBeenCalledWith('scheduler.eligible_sources.filtered', {
      referenceNow: '2026-03-04T09:01:00.000Z',
      eligibleSources: 2,
    });
  });

  it('skips conflicted reservations and keeps handler successful', async () => {
    const repository = new SpySourceRepository(
      [
        {
          items: [
            {
              sourceId: 'source-a',
              nextRunAt: '2026-03-04T09:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            },
            {
              sourceId: 'source-b',
              nextRunAt: '2026-03-04T09:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            },
          ],
          nextToken: null,
        },
      ],
      [true, false],
    );
    const handler = createHandler({
      sourceRepository: repository,
      now: () => '2026-03-04T09:00:00.000Z',
      activeSourcesPageSize: 10,
    });

    const result = await handler();

    expect(result.sourceIds).toEqual(['source-a']);
    expect(result.eligibleSources).toBe(1);
    expect(result.hasEligibleSources).toBe(true);
    expect(result.referenceNow).toBe('2026-03-04T09:00:00.000Z');
  });

  it('returns empty sourceIds and hasEligibleSources=false when all reservations conflict', async () => {
    const repository = new SpySourceRepository(
      [
        {
          items: [
            {
              sourceId: 'source-a',
              nextRunAt: '2026-03-04T09:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            },
            {
              sourceId: 'source-b',
              nextRunAt: '2026-03-04T09:00:00.000Z',
              scheduleType: 'interval',
              intervalMinutes: 5,
            },
          ],
          nextToken: null,
        },
      ],
      [false, false],
    );

    const handler = createHandler({
      sourceRepository: repository,
      now: () => '2026-03-04T09:00:00.000Z',
      activeSourcesPageSize: 10,
    });

    const result = await handler();

    expect(result.contractVersion).toBe('scheduler-output.v1');
    expect(result.sourceIds).toEqual([]);
    expect(result.eligibleSources).toBe(0);
    expect(result.hasEligibleSources).toBe(false);
    expect(result.referenceNow).toBe('2026-03-04T09:00:00.000Z');
    expect(result.generatedAt).toBe('2026-03-04T09:00:00.000Z');
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
    expect(result.contractVersion).toBe('scheduler-output.v1');
    expect(result.sourceIds).toEqual([]);
    expect(result.eligibleSources).toBe(0);
    expect(result.hasEligibleSources).toBe(false);
    expect(result.referenceNow).toBe('2026-03-04T10:00:00.000Z');
  });

  it('uses generatedAt as reference now when event.now is omitted', async () => {
    delete process.env.MAP_MAX_CONCURRENCY;
    const repository = new SpySourceRepository([
      {
        items: [
          {
            sourceId: 'source-a',
            nextRunAt: '2026-03-04T10:00:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
          {
            sourceId: 'source-b',
            nextRunAt: '2026-03-04T10:01:00.000Z',
            scheduleType: 'interval',
            intervalMinutes: 5,
          },
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
    expect(repository.reserveCalls).toEqual([
      {
        sourceId: 'source-a',
        expectedNextRunAt: '2026-03-04T10:00:00.000Z',
        nextRunAt: '2026-03-04T10:05:00.000Z',
        reservedAt: '2026-03-04T10:00:00.000Z',
      },
    ]);
    expect(result.generatedAt).toBe('2026-03-04T10:00:00.000Z');
    expect(result.sourceIds).toEqual(['source-a']);
    expect(result.eligibleSources).toBe(1);
    expect(result.hasEligibleSources).toBe(true);
    expect(result.referenceNow).toBe('2026-03-04T10:00:00.000Z');
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
