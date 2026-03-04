import type { CollectorStandardizedRecord } from './collect-postgres-records';

const TRANSIENT_HTTP_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export interface UpsertCustomersBatchRejectedRecord {
  record: CollectorStandardizedRecord;
  reason: string;
}

export interface UpsertCustomersBatchResult {
  persistedRecords: CollectorStandardizedRecord[];
  rejectedRecords: UpsertCustomersBatchRejectedRecord[];
  attempts: number;
  durationMs: number;
}

interface UpsertCustomersBatchApiItemResult {
  id: string;
  status: 'UPSERTED' | 'REJECTED';
  reason?: string;
}

interface UpsertCustomersBatchApiResponse {
  results: UpsertCustomersBatchApiItemResult[];
}

export interface UpsertCustomersBatchRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  backoffRate: number;
}

export interface UpsertCustomersBatchHttpResponse {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type UpsertCustomersBatchHttpClient = (request: {
  url: string;
  timeoutMs: number;
  body: string;
  headers: Record<string, string>;
}) => Promise<UpsertCustomersBatchHttpResponse>;

export interface UpsertCustomersBatchParams {
  sourceId: string;
  correlationId: string;
  records: readonly CollectorStandardizedRecord[];
}

export type UpsertCustomersBatchClient = (
  params: UpsertCustomersBatchParams,
) => Promise<UpsertCustomersBatchResult>;

export class UpsertCustomersBatchApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'UpsertCustomersBatchApiError';
  }
}

const stringifyRecordId = (record: CollectorStandardizedRecord): string =>
  record.id === undefined || record.id === null ? '' : String(record.id);

const toApiResponse = (value: unknown): UpsertCustomersBatchApiResponse => {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { results?: unknown }).results)) {
    throw new Error('Invalid upsert-batch response: expected object with "results" array.');
  }

  const mappedResults: UpsertCustomersBatchApiItemResult[] = [];
  for (const item of (value as { results: unknown[] }).results) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const rawId = (item as { id?: unknown }).id;
    const rawStatus = (item as { status?: unknown }).status;
    const rawReason = (item as { reason?: unknown }).reason;

    if ((typeof rawId !== 'string' && typeof rawId !== 'number') || typeof rawStatus !== 'string') {
      continue;
    }

    const normalizedStatus = rawStatus === 'REJECTED' ? 'REJECTED' : 'UPSERTED';
    mappedResults.push({
      id: String(rawId),
      status: normalizedStatus,
      reason: typeof rawReason === 'string' ? rawReason : undefined,
    });
  }

  return {
    results: mappedResults,
  };
};

const mapPartialResult = (
  records: readonly CollectorStandardizedRecord[],
  response: UpsertCustomersBatchApiResponse,
): { persistedRecords: CollectorStandardizedRecord[]; rejectedRecords: UpsertCustomersBatchRejectedRecord[] } => {
  const byId = new Map(response.results.map((result) => [result.id, result]));
  const persistedRecords: CollectorStandardizedRecord[] = [];
  const rejectedRecords: UpsertCustomersBatchRejectedRecord[] = [];

  for (const record of records) {
    const id = stringifyRecordId(record);
    const apiResult = byId.get(id);

    if (!apiResult) {
      rejectedRecords.push({
        record,
        reason: 'missing_result_from_official_api',
      });
      continue;
    }

    if (apiResult.status === 'REJECTED') {
      rejectedRecords.push({
        record,
        reason: apiResult.reason ?? 'official_api_rejected_record',
      });
      continue;
    }

    persistedRecords.push(record);
  }

  return {
    persistedRecords,
    rejectedRecords,
  };
};

const shouldRetryStatusCode = (statusCode: number): boolean =>
  TRANSIENT_HTTP_STATUS_CODES.has(statusCode);

const resolveBackoffDelay = (
  attempt: number,
  retryPolicy: UpsertCustomersBatchRetryPolicy,
): number => {
  if (attempt <= 1) {
    return retryPolicy.baseDelayMs;
  }

  return Math.round(retryPolicy.baseDelayMs * retryPolicy.backoffRate ** (attempt - 1));
};

export const createUpsertCustomersBatchClient = ({
  endpointUrl,
  timeoutMs,
  retryPolicy,
  httpClient,
  nowMs = Date.now,
  sleep = (delayMs: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    }),
}: {
  endpointUrl: string;
  timeoutMs: number;
  retryPolicy: UpsertCustomersBatchRetryPolicy;
  httpClient: UpsertCustomersBatchHttpClient;
  nowMs?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}): UpsertCustomersBatchClient => {
  if (endpointUrl.trim().length === 0) {
    throw new Error('endpointUrl is required for upsert-batch client.');
  }

  return async ({
    sourceId,
    correlationId,
    records,
  }: UpsertCustomersBatchParams): Promise<UpsertCustomersBatchResult> => {
    if (records.length === 0) {
      return {
        persistedRecords: [],
        rejectedRecords: [],
        attempts: 0,
        durationMs: 0,
      };
    }

    const startedAt = nowMs();
    let attempts = 0;

    while (attempts < retryPolicy.maxAttempts) {
      attempts += 1;
      try {
        const response = await httpClient({
          url: endpointUrl,
          timeoutMs,
          body: JSON.stringify({
            sourceId,
            correlationId,
            records,
          }),
          headers: {
            'content-type': 'application/json',
          },
        });

        if (response.status >= 400) {
          const responseBody = await response.text();
          if (shouldRetryStatusCode(response.status) && attempts < retryPolicy.maxAttempts) {
            await sleep(resolveBackoffDelay(attempts, retryPolicy));
            continue;
          }

          throw new UpsertCustomersBatchApiError(
            response.status,
            `Official API upsert-batch failed with status ${response.status}: ${responseBody}`,
          );
        }

        const parsed = toApiResponse(await response.json());
        const mapped = mapPartialResult(records, parsed);
        return {
          persistedRecords: mapped.persistedRecords,
          rejectedRecords: mapped.rejectedRecords,
          attempts,
          durationMs: nowMs() - startedAt,
        };
      } catch (error) {
        if (error instanceof UpsertCustomersBatchApiError) {
          throw error;
        }

        if (attempts < retryPolicy.maxAttempts) {
          await sleep(resolveBackoffDelay(attempts, retryPolicy));
          continue;
        }

        const reason = error instanceof Error ? error.message : 'UnknownError';
        throw new Error(`Official API upsert-batch request failed after retries: ${reason}`);
      }
    }

    throw new Error('Official API upsert-batch request exhausted retry attempts.');
  };
};
