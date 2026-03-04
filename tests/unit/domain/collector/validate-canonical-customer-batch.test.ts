import { describe, expect, it } from '@jest/globals';

import { validateCanonicalCustomerBatch } from '../../../../src/domain/collector/validate-canonical-customer-batch';

describe('validateCanonicalCustomerBatch', () => {
  it('returns versioned schema and keeps only valid canonical records', () => {
    const result = validateCanonicalCustomerBatch([
      { id: 1, email: 'valid@example.com' },
      { id: '2', email: 'also-valid@example.com' },
    ]);

    expect(result.schemaVersion).toBe('1.0.0');
    expect(result.validRecords).toEqual([
      { id: 1, email: 'valid@example.com' },
      { id: '2', email: 'also-valid@example.com' },
    ]);
    expect(result.rejectedRecords).toEqual([]);
  });

  it('returns explicit rejection reasons for invalid records', () => {
    const result = validateCanonicalCustomerBatch([
      { id: null, email: 'valid@example.com' },
      { id: 2, email: 'invalid email' },
      { id: true, email: 'x@y.com' },
    ]);

    expect(result.validRecords).toEqual([]);
    expect(result.rejectedRecords).toEqual([
      {
        index: 0,
        record: { id: null, email: 'valid@example.com' },
        issues: [
          {
            field: 'id',
            code: 'REQUIRED',
            message: 'id is required in canonical customer record.',
          },
        ],
      },
      {
        index: 1,
        record: { id: 2, email: 'invalid email' },
        issues: [
          {
            field: 'email',
            code: 'INVALID_FORMAT',
            message: 'email must contain "@" and cannot contain spaces.',
          },
        ],
      },
      {
        index: 2,
        record: { id: true, email: 'x@y.com' },
        issues: [
          {
            field: 'id',
            code: 'INVALID_TYPE',
            message: 'id must be a non-empty string or finite number.',
          },
        ],
      },
    ]);
  });
});
