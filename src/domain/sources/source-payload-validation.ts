import type { SourceRegistryRecord } from './source-registry-repository';
import {
  type SourceSchemaValidationError,
  type SourceSchemaV1,
  validateSourceSchemaV1,
} from './source-schema';

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

export const SOURCE_PAYLOAD_VALIDATION_MESSAGE = 'Source payload validation failed.';

export interface SourcePatchPayload {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const validateSourceCreatePayload = (
  payload: unknown,
):
  | { success: true; value: SourceSchemaV1 }
  | { success: false; errors: SourceSchemaValidationError[] } => validateSourceSchemaV1(payload);

export const validateSourcePatchPayload = (
  payload: unknown,
):
  | { success: true; value: SourcePatchPayload }
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
  const patch: SourcePatchPayload = {};
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
    patch[key as keyof SourcePatchPayload] = payload[key] as never;
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

export const mergeAndValidateSourcePatch = (
  current: SourceRegistryRecord,
  patch: SourcePatchPayload,
  nextUpdatedAt: string,
):
  | { success: true; value: SourceRegistryRecord }
  | { success: false; errors: SourceSchemaValidationError[] } => {
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
      success: false,
      errors: validation.errors,
    };
  }

  return {
    success: true,
    value: {
      ...validation.value,
      schemaVersion: current.schemaVersion,
      createdAt: current.createdAt,
      updatedAt: nextUpdatedAt,
    },
  };
};
