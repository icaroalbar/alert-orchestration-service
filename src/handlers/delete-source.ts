import {
  SourceVersionConflictError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { resolveTenantIdFromJwtClaims } from '../shared/auth/tenant-context';
import { resolveCorrelationId } from '../shared/logging/correlation-id';
import { createStructuredLogger } from '../shared/logging/structured-logger';
import { nowIso } from '../shared/time/now-iso';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

export interface DeleteSourceEvent {
  headers?: Record<string, string | undefined>;
  pathParameters?: {
    id?: string;
  };
  requestContext?: {
    requestId?: string;
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
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
const logger = createStructuredLogger({
  component: 'api.sources.delete',
});

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
    const correlationId = resolveCorrelationId({
      headers: event.headers,
      requestId: event.requestContext?.requestId,
    });
    logger.info('api.sources.delete.received', {
      correlationId,
    });

    const sourceId = parseSourceId(event.pathParameters?.id);
    if (!sourceId.success) {
      logger.info('api.sources.delete.rejected', {
        correlationId,
        statusCode: sourceId.response.statusCode,
        reason: 'missing_source_id',
      });
      return sourceId.response;
    }

    const tenantId = resolveTenantIdFromJwtClaims(event);
    if (!tenantId) {
      logger.info('api.sources.delete.rejected', {
        correlationId,
        statusCode: 401,
        sourceId: sourceId.value,
        reason: 'tenant_context_missing',
      });
      return response(401, {
        message: 'Missing tenant context in JWT claims.',
        code: 'TENANT_CONTEXT_MISSING',
      });
    }

    const current = await sourceRegistryRepository.getById(sourceId.value);
    if (!current || current.tenantId !== tenantId) {
      logger.info('api.sources.delete.not_found', {
        correlationId,
        statusCode: 404,
        sourceId: sourceId.value,
        tenantId,
      });
      return response(404, {
        message: `Source "${sourceId.value}" was not found.`,
        code: 'SOURCE_NOT_FOUND',
      });
    }

    if (!current.active) {
      logger.info('api.sources.delete.noop', {
        correlationId,
        statusCode: 204,
        sourceId: sourceId.value,
      });
      return noContent();
    }

    try {
      const deactivatedSource = deactivateSourceRecord(current, now());
      await sourceRegistryRepository.update({
        sourceId: current.sourceId,
        source: deactivatedSource,
        expectedUpdatedAt: current.updatedAt,
      });
      logger.info('api.sources.delete.succeeded', {
        correlationId,
        statusCode: 204,
        sourceId: current.sourceId,
      });
      return noContent();
    } catch (error) {
      if (error instanceof SourceVersionConflictError) {
        const latest = await sourceRegistryRepository.getById(sourceId.value);
        if (!latest || latest.tenantId !== tenantId) {
          logger.info('api.sources.delete.not_found', {
            correlationId,
            statusCode: 404,
            sourceId: sourceId.value,
            tenantId,
          });
          return response(404, {
            message: `Source "${sourceId.value}" was not found.`,
            code: 'SOURCE_NOT_FOUND',
          });
        }

        if (!latest.active) {
          logger.info('api.sources.delete.noop', {
            correlationId,
            statusCode: 204,
            sourceId: sourceId.value,
          });
          return noContent();
        }

        logger.info('api.sources.delete.conflict', {
          correlationId,
          statusCode: 409,
          sourceId: sourceId.value,
        });
        return response(409, {
          message: error.message,
          code: 'SOURCE_VERSION_CONFLICT',
        });
      }

      logger.info('api.sources.delete.failed', {
        correlationId,
        statusCode: 500,
        sourceId: sourceId.value,
      });
      return response(500, {
        message: 'Failed to delete source.',
      });
    }
  };

export async function handler(event: DeleteSourceEvent): Promise<DeleteSourceResponse> {
  return createHandler(getDefaultDependencies())(event);
}
