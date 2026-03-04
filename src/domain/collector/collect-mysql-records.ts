export type CollectorCursorValue = string | number;

export type CollectorStandardizedScalar = string | number | boolean | null;

export type CollectorStandardizedRecord = Record<string, CollectorStandardizedScalar>;

export interface MySqlQueryExecutor {
  query(sql: string, values: readonly unknown[]): Promise<readonly Record<string, unknown>[]>;
}

export interface CompiledIncrementalQuery {
  sql: string;
  values: readonly unknown[];
}

const CURSOR_PLACEHOLDER_REGEX = /\{\{\s*cursor\s*\}\}/g;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeScalar = (value: unknown): CollectorStandardizedScalar => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'boolean' || isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const normalizeRecord = (row: Record<string, unknown>): CollectorStandardizedRecord => {
  const normalized: CollectorStandardizedRecord = {};

  for (const [column, value] of Object.entries(row)) {
    normalized[column] = normalizeScalar(value);
  }

  return normalized;
};

export class CollectorMySqlQueryTemplateError extends Error {
  constructor(reason: string) {
    super(`Invalid MySQL incremental query template: ${reason}`);
    this.name = 'CollectorMySqlQueryTemplateError';
  }
}

export class CollectorMySqlQueryExecutionError extends Error {
  constructor(sourceId: string, reason: string) {
    super(`Unable to execute MySQL incremental query for source "${sourceId}": ${reason}.`);
    this.name = 'CollectorMySqlQueryExecutionError';
  }
}

export const compileIncrementalMySqlQuery = (
  queryTemplate: string,
  cursor: CollectorCursorValue,
): CompiledIncrementalQuery => {
  const normalizedTemplate = queryTemplate.trim();
  if (normalizedTemplate.length === 0) {
    throw new CollectorMySqlQueryTemplateError('query template is required.');
  }

  let placeholderCount = 0;
  const sql = normalizedTemplate.replace(CURSOR_PLACEHOLDER_REGEX, () => {
    placeholderCount += 1;
    return '?';
  });

  if (placeholderCount === 0) {
    throw new CollectorMySqlQueryTemplateError('template must include placeholder {{cursor}}.');
  }

  const values = Array.from({ length: placeholderCount }, () => cursor);

  return {
    sql,
    values,
  };
};

export interface CollectMySqlRecordsParams {
  sourceId: string;
  queryTemplate: string;
  cursor: CollectorCursorValue;
  mySqlQueryExecutor: MySqlQueryExecutor;
}

export const collectMySqlRecords = async ({
  sourceId,
  queryTemplate,
  cursor,
  mySqlQueryExecutor,
}: CollectMySqlRecordsParams): Promise<CollectorStandardizedRecord[]> => {
  const normalizedSourceId = sourceId.trim();
  if (normalizedSourceId.length === 0) {
    throw new Error('sourceId is required for collector execution.');
  }

  const compiledQuery = compileIncrementalMySqlQuery(queryTemplate, cursor);

  try {
    const rows = await mySqlQueryExecutor.query(compiledQuery.sql, compiledQuery.values);
    return rows.map((row) => normalizeRecord(row));
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim().length > 0 ? error.message : 'UnknownError';
    throw new CollectorMySqlQueryExecutionError(normalizedSourceId, reason);
  }
};
