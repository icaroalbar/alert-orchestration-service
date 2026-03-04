const SOURCE_SCHEMA_VERSION = '1.0.0' as const;
const QUERY_CURSOR_PLACEHOLDER = '{{cursor}}';
const INTERVAL_MINUTES_MIN = 1;
const INTERVAL_MINUTES_MAX = 10080;

export const SOURCE_ENGINES = ['postgres', 'mysql'] as const;
export const SOURCE_SCHEDULE_TYPES = ['interval', 'cron'] as const;

export type SourceEngine = (typeof SOURCE_ENGINES)[number];
export type SourceScheduleType = (typeof SOURCE_SCHEDULE_TYPES)[number];
export type SourceFieldMap = Record<string, string>;

export interface SourceBaseSchemaV1 {
  sourceId: string;
  active: boolean;
  engine: SourceEngine;
  secretArn: string;
  query: string;
  cursorField: string;
  fieldMap: SourceFieldMap;
  nextRunAt: string;
}

export interface SourceIntervalSchemaV1 extends SourceBaseSchemaV1 {
  scheduleType: 'interval';
  intervalMinutes: number;
  cronExpr?: undefined;
}

export interface SourceCronSchemaV1 extends SourceBaseSchemaV1 {
  scheduleType: 'cron';
  intervalMinutes?: undefined;
  cronExpr: string;
}

export type SourceSchemaV1 = SourceIntervalSchemaV1 | SourceCronSchemaV1;

export type SourceSchemaValidationCode =
  | 'REQUIRED'
  | 'INVALID_TYPE'
  | 'INVALID_ENUM'
  | 'INVALID_FORMAT'
  | 'INVALID_VALUE'
  | 'CONFLICT';

export interface SourceSchemaValidationError {
  field: string;
  code: SourceSchemaValidationCode;
  message: string;
}

export interface SourceSchemaValidationSuccess {
  success: true;
  value: SourceSchemaV1;
  errors: [];
}

export interface SourceSchemaValidationFailure {
  success: false;
  errors: SourceSchemaValidationError[];
}

export type SourceSchemaValidationResult =
  | SourceSchemaValidationSuccess
  | SourceSchemaValidationFailure;

export const sourceSchemaV1Definition = Object.freeze({
  version: SOURCE_SCHEMA_VERSION,
  requiredFields: [
    'sourceId',
    'active',
    'engine',
    'secretArn',
    'query',
    'cursorField',
    'fieldMap',
    'scheduleType',
    'nextRunAt',
  ],
  conditionalFields: {
    interval: ['intervalMinutes'],
    cron: ['cronExpr'],
  },
  formats: {
    queryCursorPlaceholder: QUERY_CURSOR_PLACEHOLDER,
    intervalMinutesRange: {
      min: INTERVAL_MINUTES_MIN,
      max: INTERVAL_MINUTES_MAX,
    },
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSourceEngine = (value: string): value is SourceEngine =>
  (SOURCE_ENGINES as readonly string[]).includes(value);

const isSourceScheduleType = (value: string): value is SourceScheduleType =>
  (SOURCE_SCHEDULE_TYPES as readonly string[]).includes(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isIsoDateTime = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const isSecretArn = (value: string): boolean =>
  /^arn:[^:\s]+:secretsmanager:[^:\s]+:\d{12}:secret:[A-Za-z0-9/_+=.@-]+$/.test(value);

const validateFieldMap = (
  value: unknown,
  errors: SourceSchemaValidationError[],
): SourceFieldMap | undefined => {
  if (!isRecord(value)) {
    errors.push({
      field: 'fieldMap',
      code: 'INVALID_TYPE',
      message: 'fieldMap must be an object with canonicalField -> sourceColumn mappings.',
    });
    return undefined;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    errors.push({
      field: 'fieldMap',
      code: 'INVALID_VALUE',
      message: 'fieldMap must contain at least one mapping.',
    });
    return undefined;
  }

  const output: SourceFieldMap = {};
  for (const [key, mapValue] of entries) {
    if (!isNonEmptyString(key)) {
      errors.push({
        field: 'fieldMap',
        code: 'INVALID_FORMAT',
        message: 'fieldMap keys must be non-empty strings.',
      });
      continue;
    }

    if (!isNonEmptyString(mapValue)) {
      errors.push({
        field: `fieldMap.${key}`,
        code: 'INVALID_TYPE',
        message: 'fieldMap values must be non-empty strings.',
      });
      continue;
    }

    output[key] = mapValue.trim();
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

export function validateSourceSchemaV1(input: unknown): SourceSchemaValidationResult {
  const errors: SourceSchemaValidationError[] = [];
  if (!isRecord(input)) {
    return {
      success: false,
      errors: [
        {
          field: '$',
          code: 'INVALID_TYPE',
          message: 'source payload must be an object.',
        },
      ],
    };
  }

  const sourceIdValue = input.sourceId;
  const activeValue = input.active;
  const engineValue = input.engine;
  const secretArnValue = input.secretArn;
  const queryValue = input.query;
  const cursorFieldValue = input.cursorField;
  const fieldMapValue = input.fieldMap;
  const scheduleTypeValue = input.scheduleType;
  const intervalMinutesValue = input.intervalMinutes;
  const cronExprValue = input.cronExpr;
  const nextRunAtValue = input.nextRunAt;

  let sourceId: string | undefined;
  if (!hasOwn(input, 'sourceId')) {
    errors.push({ field: 'sourceId', code: 'REQUIRED', message: 'sourceId is required.' });
  } else if (!isNonEmptyString(sourceIdValue)) {
    errors.push({
      field: 'sourceId',
      code: 'INVALID_TYPE',
      message: 'sourceId must be a non-empty string.',
    });
  } else {
    sourceId = sourceIdValue.trim();
  }

  let active: boolean | undefined;
  if (!hasOwn(input, 'active')) {
    errors.push({ field: 'active', code: 'REQUIRED', message: 'active is required.' });
  } else if (typeof activeValue !== 'boolean') {
    errors.push({
      field: 'active',
      code: 'INVALID_TYPE',
      message: 'active must be a boolean.',
    });
  } else {
    active = activeValue;
  }

  let engine: SourceEngine | undefined;
  if (!hasOwn(input, 'engine')) {
    errors.push({ field: 'engine', code: 'REQUIRED', message: 'engine is required.' });
  } else if (!isNonEmptyString(engineValue)) {
    errors.push({
      field: 'engine',
      code: 'INVALID_TYPE',
      message: 'engine must be a non-empty string.',
    });
  } else if (!isSourceEngine(engineValue)) {
    errors.push({
      field: 'engine',
      code: 'INVALID_ENUM',
      message: `engine must be one of: ${SOURCE_ENGINES.join(', ')}.`,
    });
  } else {
    engine = engineValue;
  }

  let secretArn: string | undefined;
  if (!hasOwn(input, 'secretArn')) {
    errors.push({ field: 'secretArn', code: 'REQUIRED', message: 'secretArn is required.' });
  } else if (!isNonEmptyString(secretArnValue)) {
    errors.push({
      field: 'secretArn',
      code: 'INVALID_TYPE',
      message: 'secretArn must be a non-empty string.',
    });
  } else if (!isSecretArn(secretArnValue)) {
    errors.push({
      field: 'secretArn',
      code: 'INVALID_FORMAT',
      message: 'secretArn must be a valid AWS Secrets Manager ARN.',
    });
  } else {
    secretArn = secretArnValue.trim();
  }

  let query: string | undefined;
  if (!hasOwn(input, 'query')) {
    errors.push({ field: 'query', code: 'REQUIRED', message: 'query is required.' });
  } else if (!isNonEmptyString(queryValue)) {
    errors.push({
      field: 'query',
      code: 'INVALID_TYPE',
      message: 'query must be a non-empty string.',
    });
  } else if (!queryValue.includes(QUERY_CURSOR_PLACEHOLDER)) {
    errors.push({
      field: 'query',
      code: 'INVALID_FORMAT',
      message: `query must include cursor placeholder ${QUERY_CURSOR_PLACEHOLDER}.`,
    });
  } else {
    query = queryValue.trim();
  }

  let cursorField: string | undefined;
  if (!hasOwn(input, 'cursorField')) {
    errors.push({
      field: 'cursorField',
      code: 'REQUIRED',
      message: 'cursorField is required.',
    });
  } else if (!isNonEmptyString(cursorFieldValue)) {
    errors.push({
      field: 'cursorField',
      code: 'INVALID_TYPE',
      message: 'cursorField must be a non-empty string.',
    });
  } else {
    cursorField = cursorFieldValue.trim();
  }

  let fieldMap: SourceFieldMap | undefined;
  if (!hasOwn(input, 'fieldMap')) {
    errors.push({
      field: 'fieldMap',
      code: 'REQUIRED',
      message: 'fieldMap is required.',
    });
  } else {
    fieldMap = validateFieldMap(fieldMapValue, errors);
  }

  let scheduleType: SourceScheduleType | undefined;
  if (!hasOwn(input, 'scheduleType')) {
    errors.push({
      field: 'scheduleType',
      code: 'REQUIRED',
      message: 'scheduleType is required.',
    });
  } else if (!isNonEmptyString(scheduleTypeValue)) {
    errors.push({
      field: 'scheduleType',
      code: 'INVALID_TYPE',
      message: 'scheduleType must be a non-empty string.',
    });
  } else if (!isSourceScheduleType(scheduleTypeValue)) {
    errors.push({
      field: 'scheduleType',
      code: 'INVALID_ENUM',
      message: `scheduleType must be one of: ${SOURCE_SCHEDULE_TYPES.join(', ')}.`,
    });
  } else {
    scheduleType = scheduleTypeValue;
  }

  let nextRunAt: string | undefined;
  if (!hasOwn(input, 'nextRunAt')) {
    errors.push({
      field: 'nextRunAt',
      code: 'REQUIRED',
      message: 'nextRunAt is required.',
    });
  } else if (!isNonEmptyString(nextRunAtValue)) {
    errors.push({
      field: 'nextRunAt',
      code: 'INVALID_TYPE',
      message: 'nextRunAt must be a non-empty ISO-8601 string.',
    });
  } else if (!isIsoDateTime(nextRunAtValue.trim())) {
    errors.push({
      field: 'nextRunAt',
      code: 'INVALID_FORMAT',
      message: 'nextRunAt must use ISO-8601 UTC format (e.g. 2026-03-03T10:00:00.000Z).',
    });
  } else {
    nextRunAt = nextRunAtValue.trim();
  }

  let intervalMinutes: number | undefined;
  let cronExpr: string | undefined;
  if (scheduleType === 'interval') {
    if (!hasOwn(input, 'intervalMinutes')) {
      errors.push({
        field: 'intervalMinutes',
        code: 'REQUIRED',
        message: 'intervalMinutes is required when scheduleType=interval.',
      });
    } else if (
      typeof intervalMinutesValue !== 'number' ||
      !Number.isInteger(intervalMinutesValue)
    ) {
      errors.push({
        field: 'intervalMinutes',
        code: 'INVALID_TYPE',
        message: 'intervalMinutes must be an integer.',
      });
    } else if (
      intervalMinutesValue < INTERVAL_MINUTES_MIN ||
      intervalMinutesValue > INTERVAL_MINUTES_MAX
    ) {
      errors.push({
        field: 'intervalMinutes',
        code: 'INVALID_VALUE',
        message: `intervalMinutes must be between ${INTERVAL_MINUTES_MIN} and ${INTERVAL_MINUTES_MAX}.`,
      });
    } else {
      intervalMinutes = intervalMinutesValue;
    }

    if (hasOwn(input, 'cronExpr') && cronExprValue !== undefined && cronExprValue !== null) {
      errors.push({
        field: 'cronExpr',
        code: 'CONFLICT',
        message: 'cronExpr must not be provided when scheduleType=interval.',
      });
    }
  }

  if (scheduleType === 'cron') {
    if (!hasOwn(input, 'cronExpr')) {
      errors.push({
        field: 'cronExpr',
        code: 'REQUIRED',
        message: 'cronExpr is required when scheduleType=cron.',
      });
    } else if (!isNonEmptyString(cronExprValue)) {
      errors.push({
        field: 'cronExpr',
        code: 'INVALID_TYPE',
        message: 'cronExpr must be a non-empty string.',
      });
    } else {
      cronExpr = cronExprValue.trim();
    }

    if (
      hasOwn(input, 'intervalMinutes') &&
      intervalMinutesValue !== undefined &&
      intervalMinutesValue !== null
    ) {
      errors.push({
        field: 'intervalMinutes',
        code: 'CONFLICT',
        message: 'intervalMinutes must not be provided when scheduleType=cron.',
      });
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  const base: SourceBaseSchemaV1 = {
    sourceId: sourceId as string,
    active: active as boolean,
    engine: engine as SourceEngine,
    secretArn: secretArn as string,
    query: query as string,
    cursorField: cursorField as string,
    fieldMap: fieldMap as SourceFieldMap,
    nextRunAt: nextRunAt as string,
  };

  if (scheduleType === 'interval') {
    return {
      success: true,
      value: {
        ...base,
        scheduleType: 'interval',
        intervalMinutes: intervalMinutes as number,
      },
      errors: [],
    };
  }

  return {
    success: true,
    value: {
      ...base,
      scheduleType: 'cron',
      cronExpr: cronExpr as string,
    },
    errors: [],
  };
}

export function parseSourceSchemaV1(input: unknown): SourceSchemaV1 {
  const validation = validateSourceSchemaV1(input);
  if (validation.success) {
    return validation.value;
  }

  const details = validation.errors
    .map((entry) => `${entry.field}[${entry.code}]: ${entry.message}`)
    .join(' | ');
  throw new Error(`Invalid Source schema v${SOURCE_SCHEMA_VERSION}: ${details}`);
}

export { SOURCE_SCHEMA_VERSION };
