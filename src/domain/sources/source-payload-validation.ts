import type { SourceRegistryRecord } from './source-registry-repository';
import {
  type SourceSchemaValidationError,
  type SourceSchemaV1,
  validateSourceSchemaV1,
} from './source-schema';

const IMMUTABLE_FIELDS = [
  'tenantId',
  'sourceId',
  'engine',
  'schemaVersion',
  'createdAt',
  'updatedAt',
] as const;
const MUTABLE_FIELDS = [
  'active',
  'secretArn',
  'query',
  'cursorField',
  'fieldMap',
  'scheduleType',
  'intervalMinutes',
  'cronExpr',
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
}

export type ResolvedSourceSchedule =
  | {
      scheduleType: 'interval';
      intervalMinutes: number;
      cronExpr?: undefined;
    }
  | {
      scheduleType: 'cron';
      intervalMinutes?: undefined;
      cronExpr: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const validateSourceCreatePayload = (
  payload: unknown,
):
  | { success: true; value: SourceSchemaV1 }
  | { success: false; errors: SourceSchemaValidationError[] } => {
  if (!isRecord(payload)) {
    return validateSourceSchemaV1(payload);
  }

  // `nextRunAt` is controlled by the backend at runtime.
  const payloadWithoutNextRunAt = { ...payload };
  delete payloadWithoutNextRunAt.nextRunAt;
  return validateSourceSchemaV1({
    ...payloadWithoutNextRunAt,
    nextRunAt: new Date(0).toISOString(),
  });
};

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
  nextRunAt: string,
):
  | { success: true; value: SourceRegistryRecord }
  | { success: false; errors: SourceSchemaValidationError[] } => {
  const nextSchedule = resolveSourceSchedule(current, patch);

  const validation = validateSourceSchemaV1({
    tenantId: current.tenantId,
    sourceId: current.sourceId,
    active: patch.active ?? current.active,
    engine: current.engine,
    secretArn: patch.secretArn ?? current.secretArn,
    query: patch.query ?? current.query,
    cursorField: patch.cursorField ?? current.cursorField,
    fieldMap: patch.fieldMap ?? current.fieldMap,
    scheduleType: nextSchedule.scheduleType,
    intervalMinutes: nextSchedule.intervalMinutes,
    cronExpr: nextSchedule.cronExpr,
    nextRunAt,
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

export const resolveSourceSchedule = (
  current: SourceRegistryRecord,
  patch: SourcePatchPayload,
): ResolvedSourceSchedule => {
  const nextScheduleType = patch.scheduleType ?? current.scheduleType;
  if (nextScheduleType === 'interval') {
    const nextIntervalMinutes =
      patch.intervalMinutes ??
      (current.scheduleType === 'interval' ? current.intervalMinutes : undefined);

    return {
      scheduleType: 'interval',
      intervalMinutes: nextIntervalMinutes as number,
    };
  }

  const nextCronExpr =
    patch.cronExpr ?? (current.scheduleType === 'cron' ? current.cronExpr : undefined);

  return {
    scheduleType: 'cron',
    cronExpr: nextCronExpr as string,
  };
};

export const hasSourceScheduleChanged = (
  current: SourceRegistryRecord,
  nextSchedule: ResolvedSourceSchedule,
): boolean => {
  if (current.scheduleType !== nextSchedule.scheduleType) {
    return true;
  }

  if (nextSchedule.scheduleType === 'interval') {
    return (
      current.scheduleType !== 'interval' ||
      current.intervalMinutes !== nextSchedule.intervalMinutes
    );
  }

  return current.scheduleType !== 'cron' || current.cronExpr !== nextSchedule.cronExpr;
};
