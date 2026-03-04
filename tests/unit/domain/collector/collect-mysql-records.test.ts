import { describe, expect, it } from '@jest/globals';

import {
  CollectorMySqlQueryExecutionError,
  CollectorMySqlQueryTemplateError,
  collectMySqlRecords,
  compileIncrementalMySqlQuery,
} from '../../../../src/domain/collector/collect-mysql-records';

describe('collect-mysql-records', () => {
  it('compiles template with bind parameters for cursor placeholder', () => {
    const compiled = compileIncrementalMySqlQuery(
      'select * from customers where updated_at > {{cursor}} order by updated_at asc',
      '2026-03-04T00:00:00.000Z',
    );

    expect(compiled.sql).toBe('select * from customers where updated_at > ? order by updated_at asc');
    expect(compiled.values).toEqual(['2026-03-04T00:00:00.000Z']);
  });

  it('normalizes MySQL rows to standardized serializable records', async () => {
    const rows = await collectMySqlRecords({
      sourceId: 'source-acme',
      queryTemplate: 'select * from customers where updated_at > {{cursor}}',
      cursor: '2026-03-04T00:00:00.000Z',
      mySqlQueryExecutor: {
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
      collectMySqlRecords({
        sourceId: 'source-acme',
        queryTemplate: 'select * from customers',
        cursor: '2026-03-04T00:00:00.000Z',
        mySqlQueryExecutor: {
          query: () => Promise.resolve([]),
        },
      }),
    ).rejects.toBeInstanceOf(CollectorMySqlQueryTemplateError);
  });

  it('throws controlled error when MySQL query execution fails', async () => {
    await expect(
      collectMySqlRecords({
        sourceId: 'source-acme',
        queryTemplate: 'select * from customers where updated_at > {{cursor}}',
        cursor: '2026-03-04T00:00:00.000Z',
        mySqlQueryExecutor: {
          query: () => Promise.reject(new Error('connect ETIMEDOUT')),
        },
      }),
    ).rejects.toBeInstanceOf(CollectorMySqlQueryExecutionError);

    await expect(
      collectMySqlRecords({
        sourceId: 'source-acme',
        queryTemplate: 'select * from customers where updated_at > {{cursor}}',
        cursor: '2026-03-04T00:00:00.000Z',
        mySqlQueryExecutor: {
          query: () => Promise.reject(new Error('connect ETIMEDOUT')),
        },
      }),
    ).rejects.toThrow(
      'Unable to execute MySQL incremental query for source "source-acme": connect ETIMEDOUT.',
    );
  });
});
