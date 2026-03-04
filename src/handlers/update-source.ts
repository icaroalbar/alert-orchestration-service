import {
  SourceVersionConflictError,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import {
  hasSourceScheduleChanged,
  mergeAndValidateSourcePatch,
  resolveSourceSchedule,
  SOURCE_PAYLOAD_VALIDATION_MESSAGE,
  validateSourcePatchPayload,
} from '../domain/sources/source-payload-validation';
import { calculateNextRunAt } from '../domain/sources/next-run-at';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { resolveCorrelationId } from '../shared/logging/correlation-id';
import { createStructuredLogger } from '../shared/logging/structured-logger';
import { nowIso } from '../shared/time/now-iso';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

export interface UpdateSourceEvent {
  body?: string | null;
  headers?: Record<string, string | undefined>;
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
const logger = createStructuredLogger({
  component: 'api.sources.update',
});

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
    const correlationId = resolveCorrelationId({
      headers: event.headers,
      requestId: event.requestContext?.requestId,
    });
    logger.info('api.sources.update.received', {
      correlationId,
    });

    const sourceId = parseSourceId(event.pathParameters?.id);
    if (!sourceId.success) {
      logger.info('api.sources.update.rejected', {
        correlationId,
        statusCode: sourceId.response.statusCode,
        reason: 'missing_source_id',
      });
      return sourceId.response;
    }

    const parsedBody = parseBody(event.body);
    if (!parsedBody.success) {
      logger.info('api.sources.update.rejected', {
        correlationId,
        statusCode: parsedBody.response.statusCode,
        sourceId: sourceId.value,
        reason: 'invalid_body',
      });
      return parsedBody.response;
    }

    const patchValidation = validateSourcePatchPayload(parsedBody.value);
    if (!patchValidation.success) {
      logger.info('api.sources.update.rejected', {
        correlationId,
        statusCode: 400,
        sourceId: sourceId.value,
        reason: 'validation_error',
      });
      return response(400, {
        message: SOURCE_PAYLOAD_VALIDATION_MESSAGE,
        errors: patchValidation.errors,
      });
    }

    const current = await sourceRegistryRepository.getById(sourceId.value);
    if (!current) {
      logger.info('api.sources.update.not_found', {
        correlationId,
        statusCode: 404,
        sourceId: sourceId.value,
      });
      return response(404, {
        message: `Source "${sourceId.value}" was not found.`,
        code: 'SOURCE_NOT_FOUND',
      });
    }

    const nextUpdatedAt = now();
    const nextSchedule = resolveSourceSchedule(current, patchValidation.value);
    const shouldRecalculateNextRunAt = hasSourceScheduleChanged(current, nextSchedule);
    const nextRunAt = shouldRecalculateNextRunAt
      ? calculateNextRunAt(nextSchedule, nextUpdatedAt)
      : {
          success: true as const,
          value: current.nextRunAt,
        };
    if (!nextRunAt.success) {
      logger.info('api.sources.update.rejected', {
        correlationId,
        statusCode: 400,
        sourceId: sourceId.value,
        reason: 'invalid_schedule',
      });
      return response(400, {
        message: SOURCE_PAYLOAD_VALIDATION_MESSAGE,
        errors: nextRunAt.errors,
      });
    }

    const merged = mergeAndValidateSourcePatch(
      current,
      patchValidation.value,
      nextUpdatedAt,
      nextRunAt.value,
    );
    if (!merged.success) {
      logger.info('api.sources.update.rejected', {
        correlationId,
        statusCode: 400,
        sourceId: sourceId.value,
        reason: 'merge_validation_error',
      });
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

      logger.info('api.sources.update.succeeded', {
        correlationId,
        statusCode: 200,
        sourceId: merged.value.sourceId,
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
        logger.info('api.sources.update.conflict', {
          correlationId,
          statusCode: 409,
          sourceId: current.sourceId,
        });
        return response(409, {
          message: error.message,
          code: 'SOURCE_VERSION_CONFLICT',
        });
      }

      logger.info('api.sources.update.failed', {
        correlationId,
        statusCode: 500,
        sourceId: current.sourceId,
      });
      return response(500, {
        message: 'Failed to update source.',
      });
    }
  };

export async function handler(event: UpdateSourceEvent): Promise<UpdateSourceResponse> {
  return createHandler(getDefaultDependencies())(event);
}
