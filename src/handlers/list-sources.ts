import {
  SourcePaginationTokenError,
  type ListSourceRegistryParams,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import { SOURCE_ENGINES, type SourceEngine } from '../domain/sources/source-schema';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { resolveTenantIdFromJwtClaims } from '../shared/auth/tenant-context';
import { resolveCorrelationId } from '../shared/logging/correlation-id';
import { createStructuredLogger } from '../shared/logging/structured-logger';
import {
  buildTelemetryAttributes,
  toTelemetryLogContext,
  withTelemetrySpan,
} from '../shared/observability/open-telemetry';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

export interface ListSourcesEvent {
  headers?: Record<string, string | undefined>;
  queryStringParameters?: {
    limit?: string;
    nextToken?: string;
    active?: string;
    engine?: string;
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

export interface ListSourcesResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface ListSourcesDependencies {
  sourceRegistryRepository: SourceRegistryRepository;
}

let cachedDefaultDependencies: ListSourcesDependencies | undefined;
const logger = createStructuredLogger({
  component: 'api.sources.list',
});

const response = (statusCode: number, payload: unknown): ListSourcesResponse => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(payload),
});

const parseLimit = (
  rawLimit: string | undefined,
): { success: true; value: number } | { success: false; response: ListSourcesResponse } => {
  if (rawLimit === undefined) {
    return {
      success: true,
      value: DEFAULT_LIMIT,
    };
  }

  const normalized = rawLimit.trim();
  if (normalized.length === 0) {
    return {
      success: false,
      response: response(400, {
        message: 'Query parameter "limit" must be an integer between 1 and 100.',
      }),
    };
  }

  const parsed = Number.parseInt(normalized, 10);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_LIMIT ||
    parsed > MAX_LIMIT ||
    parsed.toString() !== normalized
  ) {
    return {
      success: false,
      response: response(400, {
        message: 'Query parameter "limit" must be an integer between 1 and 100.',
      }),
    };
  }

  return {
    success: true,
    value: parsed,
  };
};

const parseNextToken = (
  rawNextToken: string | undefined,
):
  | { success: true; value: string | undefined }
  | { success: false; response: ListSourcesResponse } => {
  if (rawNextToken === undefined) {
    return {
      success: true,
      value: undefined,
    };
  }

  const normalized = rawNextToken.trim();
  if (normalized.length === 0) {
    return {
      success: false,
      response: response(400, {
        message: 'Query parameter "nextToken" must be a non-empty string when provided.',
      }),
    };
  }

  return {
    success: true,
    value: normalized,
  };
};

const parseActive = (
  rawActive: string | undefined,
):
  | { success: true; value: boolean | undefined }
  | { success: false; response: ListSourcesResponse } => {
  if (rawActive === undefined) {
    return {
      success: true,
      value: undefined,
    };
  }

  const normalized = rawActive.trim().toLowerCase();
  if (normalized === 'true') {
    return {
      success: true,
      value: true,
    };
  }

  if (normalized === 'false') {
    return {
      success: true,
      value: false,
    };
  }

  return {
    success: false,
    response: response(400, {
      message: 'Query parameter "active" must be "true" or "false".',
    }),
  };
};

const parseEngine = (
  rawEngine: string | undefined,
):
  | { success: true; value: SourceEngine | undefined }
  | { success: false; response: ListSourcesResponse } => {
  if (rawEngine === undefined) {
    return {
      success: true,
      value: undefined,
    };
  }

  const normalized = rawEngine.trim().toLowerCase();
  if ((SOURCE_ENGINES as readonly string[]).includes(normalized)) {
    return {
      success: true,
      value: normalized as SourceEngine,
    };
  }

  return {
    success: false,
    response: response(400, {
      message: `Query parameter "engine" must be one of: ${SOURCE_ENGINES.join(', ')}.`,
    }),
  };
};

const getDefaultDependencies = (): ListSourcesDependencies => {
  if (cachedDefaultDependencies) {
    return cachedDefaultDependencies;
  }

  const tableName = process.env.SOURCES_TABLE_NAME;
  if (!tableName || tableName.trim().length === 0) {
    throw new Error('SOURCES_TABLE_NAME is required.');
  }

  cachedDefaultDependencies = {
    sourceRegistryRepository: createDynamoDbSourceRegistryRepository({ tableName }),
  };

  return cachedDefaultDependencies;
};

export const createHandler =
  ({ sourceRegistryRepository }: ListSourcesDependencies) =>
  async (event: ListSourcesEvent): Promise<ListSourcesResponse> => {
    const correlationId = resolveCorrelationId({
      headers: event.headers,
      requestId: event.requestContext?.requestId,
    });
    return withTelemetrySpan({
      component: 'api.sources.list',
      spanName: 'api.sources.list',
      attributes: buildTelemetryAttributes({
        executionId: correlationId ?? undefined,
      }),
      run: async ({ span, traceContext, runInChildSpan }) => {
        logger.info('api.sources.list.received', {
          correlationId,
        });
        logger.info('api.sources.list.trace_context', {
          correlationId,
          ...toTelemetryLogContext(traceContext),
        });

        const tenantId = resolveTenantIdFromJwtClaims(event);
        if (!tenantId) {
          logger.info('api.sources.list.rejected', {
            correlationId,
            statusCode: 401,
            reason: 'tenant_context_missing',
          });
          return response(401, {
            message: 'Missing tenant context in JWT claims.',
            code: 'TENANT_CONTEXT_MISSING',
          });
        }
        span.setAttribute('tenantId', tenantId);

        const query = event.queryStringParameters ?? {};

        const limit = parseLimit(query.limit);
        if (!limit.success) {
          logger.info('api.sources.list.rejected', {
            correlationId,
            statusCode: limit.response.statusCode,
            reason: 'invalid_limit',
          });
          return limit.response;
        }

        const nextToken = parseNextToken(query.nextToken);
        if (!nextToken.success) {
          logger.info('api.sources.list.rejected', {
            correlationId,
            statusCode: nextToken.response.statusCode,
            reason: 'invalid_next_token',
          });
          return nextToken.response;
        }

        const active = parseActive(query.active);
        if (!active.success) {
          logger.info('api.sources.list.rejected', {
            correlationId,
            statusCode: active.response.statusCode,
            reason: 'invalid_active',
          });
          return active.response;
        }

        const engine = parseEngine(query.engine);
        if (!engine.success) {
          logger.info('api.sources.list.rejected', {
            correlationId,
            statusCode: engine.response.statusCode,
            reason: 'invalid_engine',
          });
          return engine.response;
        }

        const params: ListSourceRegistryParams = {
          tenantId,
          limit: limit.value,
          nextToken: nextToken.value,
          active: active.value,
          engine: engine.value,
        };

        try {
          const result = await runInChildSpan(
            {
              spanName: 'api.sources.list.repository.list',
              attributes: buildTelemetryAttributes({
                tenantId,
                executionId: correlationId ?? undefined,
              }),
            },
            async () => sourceRegistryRepository.list(params),
          );
          logger.info('api.sources.list.succeeded', {
            correlationId,
            statusCode: 200,
            returnedItems: result.items.length,
          });
          return response(200, {
            items: result.items,
            filters: {
              tenantId,
              active: active.value ?? null,
              engine: engine.value ?? null,
            },
            pagination: {
              limit: limit.value,
              nextToken: result.nextToken,
            },
            requestId: event.requestContext?.requestId ?? null,
          });
        } catch (error) {
          if (error instanceof SourcePaginationTokenError) {
            logger.info('api.sources.list.rejected', {
              correlationId,
              statusCode: 400,
              reason: 'invalid_pagination_token',
            });
            return response(400, {
              message: error.message,
              code: 'INVALID_PAGINATION_TOKEN',
            });
          }

          logger.info('api.sources.list.failed', {
            correlationId,
            statusCode: 500,
          });
          return response(500, {
            message: 'Failed to list sources.',
          });
        }
      },
    });
  };

export async function handler(event: ListSourcesEvent): Promise<ListSourcesResponse> {
  return createHandler(getDefaultDependencies())(event);
}
