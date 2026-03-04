import type { CollectorStandardizedRecord } from './collect-postgres-records';

export const CANONICAL_CUSTOMER_SCHEMA_VERSION = '1.0.0' as const;

export interface CanonicalCustomerValidationIssue {
  field: string;
  code: 'REQUIRED' | 'INVALID_TYPE' | 'INVALID_FORMAT';
  message: string;
}

export interface CanonicalCustomerRejectedRecord {
  index: number;
  record: CollectorStandardizedRecord;
  issues: CanonicalCustomerValidationIssue[];
}

export interface CanonicalCustomerBatchValidationResult {
  schemaVersion: typeof CANONICAL_CUSTOMER_SCHEMA_VERSION;
  validRecords: CollectorStandardizedRecord[];
  rejectedRecords: CanonicalCustomerRejectedRecord[];
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isValidEmail = (value: string): boolean => value.includes('@') && !value.includes(' ');

const validateId = (record: CollectorStandardizedRecord): CanonicalCustomerValidationIssue[] => {
  const value = record.id;
  const issues: CanonicalCustomerValidationIssue[] = [];

  if (value === undefined || value === null) {
    issues.push({
      field: 'id',
      code: 'REQUIRED',
      message: 'id is required in canonical customer record.',
    });
    return issues;
  }

  if (!(isNonEmptyString(value) || isFiniteNumber(value))) {
    issues.push({
      field: 'id',
      code: 'INVALID_TYPE',
      message: 'id must be a non-empty string or finite number.',
    });
  }

  return issues;
};

const validateEmail = (record: CollectorStandardizedRecord): CanonicalCustomerValidationIssue[] => {
  const value = record.email;
  if (value === undefined || value === null) {
    return [];
  }

  if (!isNonEmptyString(value)) {
    return [
      {
        field: 'email',
        code: 'INVALID_TYPE',
        message: 'email must be a non-empty string when provided.',
      },
    ];
  }

  if (!isValidEmail(value)) {
    return [
      {
        field: 'email',
        code: 'INVALID_FORMAT',
        message: 'email must contain "@" and cannot contain spaces.',
      },
    ];
  }

  return [];
};

export const validateCanonicalCustomerBatch = (
  records: readonly CollectorStandardizedRecord[],
): CanonicalCustomerBatchValidationResult => {
  const validRecords: CollectorStandardizedRecord[] = [];
  const rejectedRecords: CanonicalCustomerRejectedRecord[] = [];

  records.forEach((record, index) => {
    const issues = [...validateId(record), ...validateEmail(record)];
    if (issues.length > 0) {
      rejectedRecords.push({
        index,
        record,
        issues,
      });
      return;
    }

    validRecords.push(record);
  });

  return {
    schemaVersion: CANONICAL_CUSTOMER_SCHEMA_VERSION,
    validRecords,
    rejectedRecords,
  };
};
