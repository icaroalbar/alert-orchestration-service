import type { CollectorStandardizedRecord, CollectorStandardizedScalar } from './collect-postgres-records';

export interface CollectorFieldMapValidationDetails {
  sourceId: string;
  recordIndex: number;
  canonicalField: string;
  sourceColumn: string;
  reason: 'required_field_missing';
}

export class CollectorFieldMapValidationError extends Error {
  public readonly details: CollectorFieldMapValidationDetails;

  constructor(details: CollectorFieldMapValidationDetails) {
    super(
      `Invalid fieldMap transformation for source "${details.sourceId}" at record index ${details.recordIndex}: canonical field "${details.canonicalField}" from source column "${details.sourceColumn}" is required.`,
    );
    this.name = 'CollectorFieldMapValidationError';
    this.details = details;
  }
}

export interface MapRecordsWithFieldMapParams {
  sourceId: string;
  records: readonly CollectorStandardizedRecord[];
  fieldMap: Record<string, string>;
  requiredCanonicalFields?: readonly string[];
}

export interface MapRecordsWithFieldMapResult {
  records: CollectorStandardizedRecord[];
  ignoredSourceColumns: string[];
}

const hasValueForRequiredField = (value: CollectorStandardizedScalar | undefined): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
};

export const mapRecordsWithFieldMap = ({
  sourceId,
  records,
  fieldMap,
  requiredCanonicalFields = [],
}: MapRecordsWithFieldMapParams): MapRecordsWithFieldMapResult => {
  const normalizedSourceId = sourceId.trim();
  if (normalizedSourceId.length === 0) {
    throw new Error('sourceId is required for fieldMap transformation.');
  }

  const requiredFields = new Set(requiredCanonicalFields);
  const mappings = Object.entries(fieldMap);
  const mappedSourceColumns = new Set<string>();
  const ignoredSourceColumns = new Set<string>();

  for (const [, sourceColumn] of mappings) {
    mappedSourceColumns.add(sourceColumn);
  }

  const canonicalRecords = records.map((record, recordIndex) => {
    for (const sourceColumn of Object.keys(record)) {
      if (!mappedSourceColumns.has(sourceColumn)) {
        ignoredSourceColumns.add(sourceColumn);
      }
    }

    const mappedRecord: CollectorStandardizedRecord = {};

    for (const [canonicalField, sourceColumn] of mappings) {
      const rawValue = record[sourceColumn];
      const mappedValue = rawValue === undefined ? null : rawValue;

      if (requiredFields.has(canonicalField) && !hasValueForRequiredField(rawValue)) {
        throw new CollectorFieldMapValidationError({
          sourceId: normalizedSourceId,
          recordIndex,
          canonicalField,
          sourceColumn,
          reason: 'required_field_missing',
        });
      }

      mappedRecord[canonicalField] = mappedValue;
    }

    return mappedRecord;
  });

  return {
    records: canonicalRecords,
    ignoredSourceColumns: [...ignoredSourceColumns],
  };
};
