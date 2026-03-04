import { describe, expect, it } from '@jest/globals';

import {
  CollectorPostgresQueryExecutionError,
  CollectorPostgresQueryTemplateError,
  collectPostgresRecords,
  compileIncrementalPostgresQuery,
} from '../../../../src/domain/collector/collect-postgres-records';

describe('collect-postgres-records', () => {
  it('compiles template with bind parameters for cursor placeholder', () => {
    const compiled = compileIncrementalPostgresQuery(
      'select * from customers where updated_at > {{cursor}} order by updated_at asc',
      '2026-03-04T00:00:00.000Z',
    );

    expect(compiled.sql).toBe(
      'select * from customers where updated_at > $1 order by updated_at asc',
    );
    expect(compiled.values).toEqual(['2026-03-04T00:00:00.000Z']);
  });

  it('normalizes Postgres rows to standardized serializable records', async () => {
    const rows = await collectPostgresRecords({
      sourceId: 'source-acme',
      queryTemplate: 'select * from customers where updated_at > {{cursor}}',
      cursor: '2026-03-04T00:00:00.000Z',
      postgresQueryExecutor: {
        query: () =>
          Promise.resolve([
            {
              customer_id: 42,
              active: true,
              updated_at: new Date('2026-03-04T09:30:00.000Z'),
              revenue_cents: BigInt(1234),
              metadata: { segment: 'enterprise' },
            },
          ]),
      },
    });

    expect(rows).toEqual([
      {
        customer_id: 42,
        active: true,
        updated_at: '2026-03-04T09:30:00.000Z',
        revenue_cents: '1234',
        metadata: '{"segment":"enterprise"}',
      },
    ]);
  });

  it('throws controlled error when query does not include cursor placeholder', async () => {
    await expect(
      collectPostgresRecords({
        sourceId: 'source-acme',
        queryTemplate: 'select * from customers',
        cursor: '2026-03-04T00:00:00.000Z',
        postgresQueryExecutor: {
          query: () => Promise.resolve([]),
        },
      }),
    ).rejects.toBeInstanceOf(CollectorPostgresQueryTemplateError);
  });

  it('throws controlled error when Postgres query execution fails', async () => {
    await expect(
      collectPostgresRecords({
        sourceId: 'source-acme',
        queryTemplate: 'select * from customers where updated_at > {{cursor}}',
        cursor: '2026-03-04T00:00:00.000Z',
        postgresQueryExecutor: {
          query: () => Promise.reject(new Error('connect ETIMEDOUT')),
        },
      }),
    ).rejects.toBeInstanceOf(CollectorPostgresQueryExecutionError);

    await expect(
      collectPostgresRecords({
        sourceId: 'source-acme',
        queryTemplate: 'select * from customers where updated_at > {{cursor}}',
        cursor: '2026-03-04T00:00:00.000Z',
        postgresQueryExecutor: {
          query: () => Promise.reject(new Error('connect ETIMEDOUT')),
        },
      }),
    ).rejects.toThrow(
      'Unable to execute Postgres incremental query for source "source-acme": connect ETIMEDOUT.',
    );
  });
});
