export type CollectorIdempotencyScope = 'upsert' | 'event';

export interface CollectorIdempotencyClaim {
  deduplicationKey: string;
  scope: CollectorIdempotencyScope;
  sourceId: string;
  recordId: string;
  cursor: string;
  correlationId: string;
  createdAt: string;
  expiresAtEpochSeconds: number;
}

export interface CollectorIdempotencyRepository {
  tryClaim(claim: CollectorIdempotencyClaim): Promise<boolean>;
}
