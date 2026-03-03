import {
  SourceAlreadyExistsError,
  SourcePaginationTokenError,
  SourceVersionConflictError,
  type ListSourceRegistryParams,
  type ListSourceRegistryResult,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../domain/sources/source-registry-repository';
import type { SourceEngine } from '../../domain/sources/source-schema';

interface ListTokenPayload {
  offset: number;
  active?: boolean;
  engine?: SourceEngine;
}

const encodeListToken = (payload: ListTokenPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');

const decodeListToken = (token: string): ListTokenPayload => {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SourcePaginationTokenError();
    }

    const record = parsed as Record<string, unknown>;
    if (!Number.isInteger(record.offset) || (record.offset as number) < 0) {
      throw new SourcePaginationTokenError();
    }

    const active =
      record.active === undefined
        ? undefined
        : typeof record.active === 'boolean'
          ? record.active
          : null;
    if (active === null) {
      throw new SourcePaginationTokenError();
    }

    const engine =
      record.engine === undefined
        ? undefined
        : record.engine === 'postgres' || record.engine === 'mysql'
          ? record.engine
          : null;
    if (engine === null) {
      throw new SourcePaginationTokenError();
    }

    return {
      offset: record.offset as number,
      active,
      engine,
    };
  } catch (error) {
    if (error instanceof SourcePaginationTokenError) {
      throw error;
    }

    throw new SourcePaginationTokenError();
  }
};

const areFiltersEqual = (token: ListTokenPayload, params: ListSourceRegistryParams): boolean =>
  token.active === params.active && token.engine === params.engine;

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
    list(params: ListSourceRegistryParams): Promise<ListSourceRegistryResult> {
      const tokenPayload = params.nextToken ? decodeListToken(params.nextToken) : undefined;
      const offset = tokenPayload?.offset ?? 0;
      if (tokenPayload) {
        if (!areFiltersEqual(tokenPayload, params)) {
          throw new SourcePaginationTokenError('Pagination token does not match provided filters.');
        }
      }

      const filtered = [...storage.values()]
        .filter((source) => (params.active === undefined ? true : source.active === params.active))
        .filter((source) => (params.engine === undefined ? true : source.engine === params.engine))
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

      const items = filtered.slice(offset, offset + params.limit);
      const nextOffset = offset + items.length;
      const nextToken =
        nextOffset < filtered.length
          ? encodeListToken({
              offset: nextOffset,
              active: params.active,
              engine: params.engine,
            })
          : null;

      return Promise.resolve({ items, nextToken });
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
