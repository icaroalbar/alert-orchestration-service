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
});
