export type CollectorCursorValue = string | number;

export interface CollectorCursorRecord {
  source: string;
  last: CollectorCursorValue;
  updatedAt: string;
}

export interface CollectorCursorRepository {
  getBySource(source: string): Promise<CollectorCursorRecord | null>;
  save(params: {
    source: string;
    last: CollectorCursorValue;
    updatedAt: string;
    expectedUpdatedAt?: string;
  }): Promise<void>;
}

export class CollectorCursorConflictError extends Error {
  constructor(source: string) {
    super(`Collector cursor for source "${source}" has changed concurrently.`);
    this.name = 'CollectorCursorConflictError';
  }
}
