export type CollectorIdempotencyScope = 'upsert' | 'event';
export type CollectorIdempotencyStatus = 'PENDING' | 'COMPLETED';

export interface CollectorIdempotencyClaim {
  deduplicationKey: string;
  scope: CollectorIdempotencyScope;
  status?: CollectorIdempotencyStatus;
  sourceId: string;
  recordId: string;
  cursor: string;
  correlationId: string;
  createdAt: string;
  expiresAtEpochSeconds: number;
}

export interface CollectorIdempotencyCompletion {
  deduplicationKey: string;
  completedAt: string;
  expiresAtEpochSeconds: number;
}

export interface CollectorIdempotencyRepository {
  tryClaim(claim: CollectorIdempotencyClaim): Promise<boolean>;
  markCompleted(params: CollectorIdempotencyCompletion): Promise<void>;
}
