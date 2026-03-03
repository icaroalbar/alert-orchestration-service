import {
  SourceVersionConflictError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../domain/sources/source-registry-repository';
import {
  type SourceSchemaValidationError,
  validateSourceSchemaV1,
} from '../domain/sources/source-schema';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { nowIso } from '../shared/time/now-iso';

const JSON_HEADERS = {
  'content-type': 'application/json',
};

const IMMUTABLE_FIELDS = ['sourceId', 'engine', 'schemaVersion', 'createdAt', 'updatedAt'] as const;
const MUTABLE_FIELDS = [
  'active',
  'secretArn',
  'query',
  'cursorField',
  'fieldMap',
  'scheduleType',
  'intervalMinutes',
  'cronExpr',
  'nextRunAt',
] as const;
const KNOWN_FIELDS = new Set<string>([...IMMUTABLE_FIELDS, ...MUTABLE_FIELDS]);

interface UpdateSourcePatchPayload {
  active?: boolean;
  secretArn?: string;
  query?: string;
  cursorField?: string;
  fieldMap?: Record<string, string>;
  scheduleType?: 'interval' | 'cron';
  intervalMinutes?: number;
  cronExpr?: string;
  nextRunAt?: string;
}

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const validatePatchPayload = (
  payload: unknown,
):
  | { success: true; value: UpdateSourcePatchPayload }
  | { success: false; errors: SourceSchemaValidationError[] } => {
  if (!isRecord(payload)) {
    return {
      success: false,
      errors: [
        {
          field: '$',
          code: 'INVALID_TYPE',
          message: 'patch payload must be an object.',
        },
      ],
    };
  }

  const errors: SourceSchemaValidationError[] = [];
  const patch: UpdateSourcePatchPayload = {};
  let mutableFieldCount = 0;

  for (const key of Object.keys(payload)) {
    if (!KNOWN_FIELDS.has(key)) {
      errors.push({
        field: key,
        code: 'INVALID_VALUE',
        message: `field "${key}" is not supported for source updates.`,
      });
      continue;
    }

    if ((IMMUTABLE_FIELDS as readonly string[]).includes(key)) {
      errors.push({
        field: key,
        code: 'INVALID_VALUE',
        message: `field "${key}" is immutable and cannot be updated.`,
      });
      continue;
    }

    mutableFieldCount += 1;
    patch[key as keyof UpdateSourcePatchPayload] = payload[key] as never;
  }

  if (mutableFieldCount === 0) {
    errors.push({
      field: '$',
      code: 'INVALID_VALUE',
      message: 'patch payload must include at least one mutable field.',
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    value: patch,
  };
};

const mergeSourceRecord = (
  current: SourceRegistryRecord,
  patch: UpdateSourcePatchPayload,
  nextUpdatedAt: string,
): SourceRegistryRecord | { validationErrors: SourceSchemaValidationError[] } => {
  const nextScheduleType = patch.scheduleType ?? current.scheduleType;
  const nextIntervalMinutes =
    nextScheduleType === 'interval'
      ? (patch.intervalMinutes ??
        (current.scheduleType === 'interval' ? current.intervalMinutes : undefined))
      : patch.intervalMinutes;
  const nextCronExpr =
    nextScheduleType === 'cron'
      ? (patch.cronExpr ?? (current.scheduleType === 'cron' ? current.cronExpr : undefined))
      : patch.cronExpr;

  const validation = validateSourceSchemaV1({
    sourceId: current.sourceId,
    active: patch.active ?? current.active,
    engine: current.engine,
    secretArn: patch.secretArn ?? current.secretArn,
    query: patch.query ?? current.query,
    cursorField: patch.cursorField ?? current.cursorField,
    fieldMap: patch.fieldMap ?? current.fieldMap,
    scheduleType: nextScheduleType,
    intervalMinutes: nextIntervalMinutes,
    cronExpr: nextCronExpr,
    nextRunAt: patch.nextRunAt ?? current.nextRunAt,
  });

  if (!validation.success) {
    return {
      validationErrors: validation.errors,
    };
  }

  return {
    ...validation.value,
    schemaVersion: current.schemaVersion,
    createdAt: current.createdAt,
    updatedAt: nextUpdatedAt,
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

    const patchValidation = validatePatchPayload(parsedBody.value);
    if (!patchValidation.success) {
      return response(422, {
        message: 'Source patch validation failed.',
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
    const merged = mergeSourceRecord(current, patchValidation.value, nextUpdatedAt);
    if ('validationErrors' in merged) {
      return response(422, {
        message: 'Source patch validation failed.',
        errors: merged.validationErrors,
      });
    }

    try {
      await sourceRegistryRepository.update({
        sourceId: current.sourceId,
        source: merged,
        expectedUpdatedAt: current.updatedAt,
      });

      return response(200, {
        sourceId: merged.sourceId,
        metadata: {
          schemaVersion: merged.schemaVersion,
          createdAt: merged.createdAt,
          updatedAt: merged.updatedAt,
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
