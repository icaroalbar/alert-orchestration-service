import type { SourceEngine, SourceSchemaV1 } from './source-schema';

export type SourceRegistryRecord = SourceSchemaV1 & {
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
};

export interface ListSourceRegistryParams {
  tenantId: string;
  limit: number;
  nextToken?: string;
  active?: boolean;
  engine?: SourceEngine;
}

export interface ListSourceRegistryResult {
  items: SourceRegistryRecord[];
  nextToken: string | null;
}

export interface SourceRegistryRepository {
  create(source: SourceRegistryRecord): Promise<void>;
  getById(sourceId: string): Promise<SourceRegistryRecord | null>;
  list(params: ListSourceRegistryParams): Promise<ListSourceRegistryResult>;
  update(params: {
    sourceId: string;
    source: SourceRegistryRecord;
    expectedUpdatedAt: string;
  }): Promise<void>;
}

export class SourceAlreadyExistsError extends Error {
  constructor(sourceId: string) {
    super(`Source "${sourceId}" already exists.`);
    this.name = 'SourceAlreadyExistsError';
  }
}

export class SourceVersionConflictError extends Error {
  constructor(sourceId: string) {
    super(`Source "${sourceId}" version conflict.`);
    this.name = 'SourceVersionConflictError';
  }
}

export class SourcePaginationTokenError extends Error {
  constructor(message = 'Invalid pagination token.') {
    super(message);
    this.name = 'SourcePaginationTokenError';
  }
}
