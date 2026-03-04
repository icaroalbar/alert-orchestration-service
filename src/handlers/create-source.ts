import {
  SOURCE_PAYLOAD_VALIDATION_MESSAGE,
  validateSourceCreatePayload,
} from '../domain/sources/source-payload-validation';
import { SOURCE_SCHEMA_VERSION } from '../domain/sources/source-schema';
import {
  SourceAlreadyExistsError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import { calculateNextRunAt } from '../domain/sources/next-run-at';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { resolveTenantIdFromJwtClaims } from '../shared/auth/tenant-context';
import { resolveCorrelationId } from '../shared/logging/correlation-id';
import { createStructuredLogger } from '../shared/logging/structured-logger';
import { nowIso } from '../shared/time/now-iso';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

export interface CreateSourceEvent {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
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
const logger = createStructuredLogger({
  component: 'api.sources.create',
});

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    const correlationId = resolveCorrelationId({
      headers: event.headers,
      requestId: event.requestContext?.requestId,
    });
    logger.info('api.sources.create.received', {
      correlationId,
    });

    const parsedBody = parseBody(event.body);
    if (!parsedBody.success) {
      logger.info('api.sources.create.rejected', {
        correlationId,
        statusCode: parsedBody.response.statusCode,
        reason: 'invalid_body',
      });
      return parsedBody.response;
    }

    const tenantId = resolveTenantIdFromJwtClaims(event);
    if (!tenantId) {
      logger.info('api.sources.create.rejected', {
        correlationId,
        statusCode: 401,
        reason: 'tenant_context_missing',
      });
      return response(401, {
        message: 'Missing tenant context in JWT claims.',
        code: 'TENANT_CONTEXT_MISSING',
      });
    }

    if (
      isRecord(parsedBody.value) &&
      typeof parsedBody.value.tenantId === 'string' &&
      parsedBody.value.tenantId.trim().length > 0 &&
      parsedBody.value.tenantId.trim() !== tenantId
    ) {
      logger.info('api.sources.create.rejected', {
        correlationId,
        statusCode: 403,
        reason: 'tenant_mismatch',
      });
      return response(403, {
        message: 'Payload tenantId does not match authenticated tenant.',
        code: 'TENANT_CONTEXT_MISMATCH',
      });
    }

    const payloadForValidation = isRecord(parsedBody.value)
      ? {
          ...parsedBody.value,
          tenantId,
        }
      : parsedBody.value;
    const validation = validateSourceCreatePayload(payloadForValidation);
    if (!validation.success) {
      logger.info('api.sources.create.rejected', {
        correlationId,
        statusCode: 400,
        reason: 'validation_error',
      });
      return response(400, {
        message: SOURCE_PAYLOAD_VALIDATION_MESSAGE,
        errors: validation.errors,
      });
    }

    const createdAt = now();
    const nextRunAt =
      validation.value.scheduleType === 'interval'
        ? calculateNextRunAt(
            {
              scheduleType: 'interval',
              intervalMinutes: validation.value.intervalMinutes,
            },
            createdAt,
          )
        : calculateNextRunAt(
            {
              scheduleType: 'cron',
              cronExpr: validation.value.cronExpr,
            },
            createdAt,
          );
    if (!nextRunAt.success) {
      logger.info('api.sources.create.rejected', {
        correlationId,
        statusCode: 400,
        reason: 'invalid_schedule',
      });
      return response(400, {
        message: SOURCE_PAYLOAD_VALIDATION_MESSAGE,
        errors: nextRunAt.errors,
      });
    }

    const record: SourceRegistryRecord = {
      ...validation.value,
      nextRunAt: nextRunAt.value,
      schemaVersion: SOURCE_SCHEMA_VERSION,
      createdAt,
      updatedAt: createdAt,
    };

    try {
      await sourceRegistryRepository.create(record);
      logger.info('api.sources.create.succeeded', {
        correlationId,
        statusCode: 201,
        sourceId: record.sourceId,
      });
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
        logger.info('api.sources.create.conflict', {
          correlationId,
          statusCode: 409,
          sourceId: record.sourceId,
        });
        return response(409, {
          message: error.message,
          code: 'SOURCE_ALREADY_EXISTS',
        });
      }

      logger.info('api.sources.create.failed', {
        correlationId,
        statusCode: 500,
        sourceId: record.sourceId,
      });
      return response(500, {
        message: 'Failed to create source.',
      });
    }
  };

export async function handler(event: CreateSourceEvent): Promise<CreateSourceResponse> {
  return createHandler(getDefaultDependencies())(event);
}
