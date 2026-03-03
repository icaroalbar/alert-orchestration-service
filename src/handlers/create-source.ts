import { SOURCE_SCHEMA_VERSION, validateSourceSchemaV1 } from '../domain/sources/source-schema';
import {
  SourceAlreadyExistsError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { nowIso } from '../shared/time/now-iso';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

export interface CreateSourceEvent {
  body?: string | null;
  requestContext?: {
    requestId?: string;
  };
}

export interface CreateSourceResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface CreateSourceDependencies {
  sourceRegistryRepository: SourceRegistryRepository;
  now: () => string;
}

let cachedDefaultDependencies: CreateSourceDependencies | undefined;

const response = (statusCode: number, payload: unknown): CreateSourceResponse => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(payload),
});

const parseBody = (
  rawBody: string | null | undefined,
): { success: true; value: unknown } | { success: false; response: CreateSourceResponse } => {
  if (typeof rawBody !== 'string' || rawBody.trim().length === 0) {
    return {
      success: false,
      response: response(400, {
        message: 'Request body must be a valid JSON object.',
      }),
    };
  }

  try {
    return {
      success: true,
      value: JSON.parse(rawBody) as unknown,
    };
  } catch {
    return {
      success: false,
      response: response(400, {
        message: 'Request body must be valid JSON.',
      }),
    };
  }
};

const getDefaultDependencies = (): CreateSourceDependencies => {
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

export const createHandler =
  ({ sourceRegistryRepository, now }: CreateSourceDependencies) =>
  async (event: CreateSourceEvent): Promise<CreateSourceResponse> => {
    const parsedBody = parseBody(event.body);
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const validation = validateSourceSchemaV1(parsedBody.value);
    if (!validation.success) {
      return response(422, {
        message: 'Source payload validation failed.',
        errors: validation.errors,
      });
    }

    const createdAt = now();
    const record: SourceRegistryRecord = {
      ...validation.value,
      schemaVersion: SOURCE_SCHEMA_VERSION,
      createdAt,
      updatedAt: createdAt,
    };

    try {
      await sourceRegistryRepository.create(record);
      return response(201, {
        sourceId: record.sourceId,
        metadata: {
          schemaVersion: record.schemaVersion,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          requestId: event.requestContext?.requestId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof SourceAlreadyExistsError) {
        return response(409, {
          message: error.message,
          code: 'SOURCE_ALREADY_EXISTS',
        });
      }

      return response(500, {
        message: 'Failed to create source.',
      });
    }
  };

export async function handler(event: CreateSourceEvent): Promise<CreateSourceResponse> {
  return createHandler(getDefaultDependencies())(event);
}
