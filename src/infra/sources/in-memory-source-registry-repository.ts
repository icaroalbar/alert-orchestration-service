import {
  SourceAlreadyExistsError,
  SourceVersionConflictError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../domain/sources/source-registry-repository';

export interface InMemorySourceRegistryStore {
  get(sourceId: string): SourceRegistryRecord | undefined;
}

export function createInMemorySourceRegistryRepository(
  seed: SourceRegistryRecord[] = [],
): SourceRegistryRepository & InMemorySourceRegistryStore {
  const storage = new Map<string, SourceRegistryRecord>(
    seed.map((source) => [source.sourceId, source]),
  );

  return {
    create(source: SourceRegistryRecord): Promise<void> {
      if (storage.has(source.sourceId)) {
        throw new SourceAlreadyExistsError(source.sourceId);
      }

      storage.set(source.sourceId, source);
      return Promise.resolve();
    },
    get(sourceId: string): SourceRegistryRecord | undefined {
      return storage.get(sourceId);
    },
    getById(sourceId: string): Promise<SourceRegistryRecord | null> {
      return Promise.resolve(storage.get(sourceId) ?? null);
    },
    update({
      sourceId,
      source,
      expectedUpdatedAt,
    }: {
      sourceId: string;
      source: SourceRegistryRecord;
      expectedUpdatedAt: string;
    }): Promise<void> {
      const current = storage.get(sourceId);
      if (!current || current.updatedAt !== expectedUpdatedAt) {
        throw new SourceVersionConflictError(sourceId);
      }

      storage.set(sourceId, source);
      return Promise.resolve();
    },
  };
}
