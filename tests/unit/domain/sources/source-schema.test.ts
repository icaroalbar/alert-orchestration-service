import { describe, expect, it } from '@jest/globals';

import {
  parseSourceSchemaV1,
  SOURCE_SCHEMA_VERSION,
  validateSourceSchemaV1,
} from '../../../../src/domain/sources/source-schema';

const validIntervalPayload = {
  sourceId: 'source-acme',
  active: true,
  engine: 'postgres',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:source-acme',
  query: 'SELECT * FROM customers WHERE updated_at > {{cursor}} ORDER BY updated_at ASC',
  cursorField: 'updated_at',
  fieldMap: {
    externalId: 'customer_id',
    fullName: 'name',
  },
  scheduleType: 'interval',
  intervalMinutes: 15,
  nextRunAt: '2026-03-03T22:00:00.000Z',
} as const;

describe('source schema v1', () => {
  it('validates interval schedule payload', () => {
    const result = validateSourceSchemaV1(validIntervalPayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.value.scheduleType).toBe('interval');
    expect(result.value.intervalMinutes).toBe(15);
    expect(result.value.cronExpr).toBeUndefined();
  });

  it('validates cron schedule payload', () => {
    const result = validateSourceSchemaV1({
      ...validIntervalPayload,
      scheduleType: 'cron',
      cronExpr: '0 */10 * * * ?',
      intervalMinutes: undefined,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.value.scheduleType).toBe('cron');
    expect(result.value.cronExpr).toBe('0 */10 * * * ?');
    expect(result.value.intervalMinutes).toBeUndefined();
  });

  it('returns explicit errors for missing required fields', () => {
    const result = validateSourceSchemaV1({});

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const fields = result.errors.map((entry) => entry.field);
    expect(fields).toContain('sourceId');
    expect(fields).toContain('engine');
    expect(fields).toContain('scheduleType');
    expect(fields).toContain('nextRunAt');
  });

  it('rejects query without cursor placeholder', () => {
    const result = validateSourceSchemaV1({
      ...validIntervalPayload,
      query: 'SELECT * FROM customers',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'query',
        code: 'INVALID_FORMAT',
      }),
    );
  });

  it('rejects invalid fieldMap entries', () => {
    const result = validateSourceSchemaV1({
      ...validIntervalPayload,
      fieldMap: {
        externalId: 123,
      },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'fieldMap.externalId',
        code: 'INVALID_TYPE',
      }),
    );
  });

  it('rejects schedule conflicts between interval and cron fields', () => {
    const result = validateSourceSchemaV1({
      ...validIntervalPayload,
      cronExpr: '0 */10 * * * ?',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'cronExpr',
        code: 'CONFLICT',
      }),
    );
  });

  it('rejects invalid nextRunAt format', () => {
    const result = validateSourceSchemaV1({
      ...validIntervalPayload,
      nextRunAt: '03-03-2026 22:00',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'nextRunAt',
        code: 'INVALID_FORMAT',
      }),
    );
  });

  it('throws with versioned message on parse errors', () => {
    expect(() => parseSourceSchemaV1({})).toThrow(
      `Invalid Source schema v${SOURCE_SCHEMA_VERSION}`,
    );
  });
});
