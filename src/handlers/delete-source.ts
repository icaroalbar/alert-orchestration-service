import {
  SourceVersionConflictError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { nowIso } from '../shared/time/now-iso';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

export interface DeleteSourceEvent {
  pathParameters?: {
    id?: string;
  };
}

export interface DeleteSourceResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface DeleteSourceDependencies {
  sourceRegistryRepository: SourceRegistryRepository;
  now: () => string;
}

let cachedDefaultDependencies: DeleteSourceDependencies | undefined;

const response = (statusCode: number, payload: unknown): DeleteSourceResponse => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(payload),
});

const noContent = (): DeleteSourceResponse => ({
  statusCode: 204,
  headers: {},
  body: '',
});

const parseSourceId = (
  rawSourceId: string | undefined,
): { success: true; value: string } | { success: false; response: DeleteSourceResponse } => {
  if (typeof rawSourceId !== 'string' || rawSourceId.trim().length === 0) {
    return {
      success: false,
      response: response(400, {
        message: 'Path parameter "id" is required.',
      }),
    };
  }

  return {
    success: true,
    value: rawSourceId.trim(),
  };
};

const getDefaultDependencies = (): DeleteSourceDependencies => {
  if (cachedDefaultDependencies) {
    return cachedDefaultDependencies;
  }

  const tableName = process.env.SOURCES_TABLE_NAME;
  if (!tableName || tableName.trim().length === 0) {
    throw new Error('SOURCES_TABLE_NAME is required.');
  }

  cachedDefaultDependencies = {
    sourceRegistryRepository: createDynamoDbSourceRegistryRepository({ tableName }),
    now: nowIso,
  };

  return cachedDefaultDependencies;
};

const deactivateSourceRecord = (
  source: SourceRegistryRecord,
  updatedAt: string,
): SourceRegistryRecord => ({
  ...source,
  active: false,
  updatedAt,
});

export const createHandler =
  ({ sourceRegistryRepository, now }: DeleteSourceDependencies) =>
  async (event: DeleteSourceEvent): Promise<DeleteSourceResponse> => {
    const sourceId = parseSourceId(event.pathParameters?.id);
    if (!sourceId.success) {
      return sourceId.response;
    }

    const current = await sourceRegistryRepository.getById(sourceId.value);
    if (!current) {
      return response(404, {
        message: `Source "${sourceId.value}" was not found.`,
        code: 'SOURCE_NOT_FOUND',
      });
    }

    if (!current.active) {
      return noContent();
    }

    try {
      const deactivatedSource = deactivateSourceRecord(current, now());
      await sourceRegistryRepository.update({
        sourceId: current.sourceId,
        source: deactivatedSource,
        expectedUpdatedAt: current.updatedAt,
      });
      return noContent();
    } catch (error) {
      if (error instanceof SourceVersionConflictError) {
        const latest = await sourceRegistryRepository.getById(sourceId.value);
        if (!latest) {
          return response(404, {
            message: `Source "${sourceId.value}" was not found.`,
            code: 'SOURCE_NOT_FOUND',
          });
        }

        if (!latest.active) {
          return noContent();
        }

        return response(409, {
          message: error.message,
          code: 'SOURCE_VERSION_CONFLICT',
        });
      }

      return response(500, {
        message: 'Failed to delete source.',
      });
    }
  };

export async function handler(event: DeleteSourceEvent): Promise<DeleteSourceResponse> {
  return createHandler(getDefaultDependencies())(event);
}
