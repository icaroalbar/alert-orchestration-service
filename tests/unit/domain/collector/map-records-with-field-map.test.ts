import { describe, expect, it } from '@jest/globals';

import {
  CollectorFieldMapValidationError,
  mapRecordsWithFieldMap,
} from '../../../../src/domain/collector/map-records-with-field-map';

describe('mapRecordsWithFieldMap', () => {
  it('maps source columns into canonical fields and reports ignored columns', () => {
    const result = mapRecordsWithFieldMap({
      sourceId: 'source-acme',
      records: [
        {
          customer_id: 123,
          email_address: 'customer@example.com',
          updated_at: '2026-03-04T10:00:00.000Z',
        },
      ],
      fieldMap: {
        id: 'customer_id',
        email: 'email_address',
      },
      requiredCanonicalFields: ['id'],
    });

    expect(result.records).toEqual([
      {
        id: 123,
        email: 'customer@example.com',
      },
    ]);
    expect(result.ignoredSourceColumns).toEqual(['updated_at']);
  });

  it('maps optional fields to null when source column is absent', () => {
    const result = mapRecordsWithFieldMap({
      sourceId: 'source-acme',
      records: [
        {
          customer_id: 123,
        },
      ],
      fieldMap: {
        id: 'customer_id',
        email: 'email_address',
      },
      requiredCanonicalFields: ['id'],
    });

    expect(result.records).toEqual([
      {
        id: 123,
        email: null,
      },
    ]);
  });

  it('throws traceable error when a required canonical field cannot be mapped', () => {
    expect(() =>
      mapRecordsWithFieldMap({
        sourceId: 'source-acme',
        records: [
          {
            email_address: 'missing-id@example.com',
          },
        ],
        fieldMap: {
          id: 'customer_id',
          email: 'email_address',
        },
        requiredCanonicalFields: ['id'],
      }),
    ).toThrow(CollectorFieldMapValidationError);

    try {
      mapRecordsWithFieldMap({
        sourceId: 'source-acme',
        records: [
          {
            email_address: 'missing-id@example.com',
          },
        ],
        fieldMap: {
          id: 'customer_id',
          email: 'email_address',
        },
        requiredCanonicalFields: ['id'],
      });
    } catch (error) {
      const typedError = error as CollectorFieldMapValidationError;
      expect(typedError.details).toEqual({
        sourceId: 'source-acme',
        recordIndex: 0,
        canonicalField: 'id',
        sourceColumn: 'customer_id',
        reason: 'required_field_missing',
      });
    }
  });

  it('maps composed canonical payload with multiple mapped fields in a single pass', () => {
    const result = mapRecordsWithFieldMap({
      sourceId: 'source-acme',
      records: [
        {
          customer_id: 456,
          first_name: 'Ada',
          last_name: 'Lovelace',
          loyalty_level: 'gold',
          external_meta: 'ignored',
        },
      ],
      fieldMap: {
        id: 'customer_id',
        firstName: 'first_name',
        lastName: 'last_name',
        loyaltyTier: 'loyalty_level',
      },
      requiredCanonicalFields: ['id'],
    });

    expect(result.records).toEqual([
      {
        id: 456,
        firstName: 'Ada',
        lastName: 'Lovelace',
        loyaltyTier: 'gold',
      },
    ]);
    expect(result.ignoredSourceColumns).toEqual(['external_meta']);
  });

  it('keeps canonical scalar types stable when mapping numbers, booleans and nullables', () => {
    const result = mapRecordsWithFieldMap({
      sourceId: 'source-acme',
      records: [
        {
          customer_id: 789,
          is_active: true,
          vip_score: 98.5,
          notes: null,
        },
      ],
      fieldMap: {
        id: 'customer_id',
        active: 'is_active',
        score: 'vip_score',
        notes: 'notes',
        email: 'email_address',
      },
      requiredCanonicalFields: ['id'],
    });

    expect(result.records).toEqual([
      {
        id: 789,
        active: true,
        score: 98.5,
        notes: null,
        email: null,
      },
    ]);
  });
});
