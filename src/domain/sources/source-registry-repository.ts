import type { SourceSchemaV1 } from './source-schema';

export type SourceRegistryRecord = SourceSchemaV1 & {
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
};

export interface SourceRegistryRepository {
  create(source: SourceRegistryRecord): Promise<void>;
  getById(sourceId: string): Promise<SourceRegistryRecord | null>;
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
