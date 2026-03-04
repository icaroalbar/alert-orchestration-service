import {
  SourceVersionConflictError,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import {
  mergeAndValidateSourcePatch,
  SOURCE_PAYLOAD_VALIDATION_MESSAGE,
  validateSourcePatchPayload,
} from '../domain/sources/source-payload-validation';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { nowIso } from '../shared/time/now-iso';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

export interface UpdateSourceEvent {
  body?: string | null;
  pathParameters?: {
    id?: string;
  };
  requestContext?: {
    requestId?: string;
  };
}

export interface UpdateSourceResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface UpdateSourceDependencies {
  sourceRegistryRepository: SourceRegistryRepository;
  now: () => string;
}

let cachedDefaultDependencies: UpdateSourceDependencies | undefined;

const response = (statusCode: number, payload: unknown): UpdateSourceResponse => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(payload),
});

const parseBody = (
  rawBody: string | null | undefined,
): { success: true; value: unknown } | { success: false; response: UpdateSourceResponse } => {
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

const parseSourceId = (
  rawSourceId: string | undefined,
): { success: true; value: string } | { success: false; response: UpdateSourceResponse } => {
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

const getDefaultDependencies = (): UpdateSourceDependencies => {
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
  ({ sourceRegistryRepository, now }: UpdateSourceDependencies) =>
  async (event: UpdateSourceEvent): Promise<UpdateSourceResponse> => {
    const sourceId = parseSourceId(event.pathParameters?.id);
    if (!sourceId.success) {
      return sourceId.response;
    }

    const parsedBody = parseBody(event.body);
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const patchValidation = validateSourcePatchPayload(parsedBody.value);
    if (!patchValidation.success) {
      return response(400, {
        message: SOURCE_PAYLOAD_VALIDATION_MESSAGE,
        errors: patchValidation.errors,
      });
    }

    const current = await sourceRegistryRepository.getById(sourceId.value);
    if (!current) {
      return response(404, {
        message: `Source "${sourceId.value}" was not found.`,
        code: 'SOURCE_NOT_FOUND',
      });
    }

    const nextUpdatedAt = now();
    const merged = mergeAndValidateSourcePatch(current, patchValidation.value, nextUpdatedAt);
    if (!merged.success) {
      return response(400, {
        message: SOURCE_PAYLOAD_VALIDATION_MESSAGE,
        errors: merged.errors,
      });
    }

    try {
      await sourceRegistryRepository.update({
        sourceId: current.sourceId,
        source: merged.value,
        expectedUpdatedAt: current.updatedAt,
      });

      return response(200, {
        sourceId: merged.value.sourceId,
        metadata: {
          schemaVersion: merged.value.schemaVersion,
          createdAt: merged.value.createdAt,
          updatedAt: merged.value.updatedAt,
          requestId: event.requestContext?.requestId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof SourceVersionConflictError) {
        return response(409, {
          message: error.message,
          code: 'SOURCE_VERSION_CONFLICT',
        });
      }

      return response(500, {
        message: 'Failed to update source.',
      });
    }
  };

export async function handler(event: UpdateSourceEvent): Promise<UpdateSourceResponse> {
  return createHandler(getDefaultDependencies())(event);
}
