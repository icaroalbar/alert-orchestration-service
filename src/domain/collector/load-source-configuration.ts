import type { SourceRegistryRecord, SourceRegistryRepository } from '../sources/source-registry-repository';
import { validateSourceSchemaV1 } from '../sources/source-schema';

export type CollectorSourceConfiguration = SourceRegistryRecord;
export type CollectorSourceConfigurationRepository = Pick<SourceRegistryRepository, 'getById'>;

export class CollectorSourceNotFoundError extends Error {
  constructor(sourceId: string) {
    super(`Source "${sourceId}" was not found in sources registry.`);
    this.name = 'CollectorSourceNotFoundError';
  }
}

export class CollectorSourceInactiveError extends Error {
  constructor(sourceId: string) {
    super(`Source "${sourceId}" is inactive and cannot be collected.`);
    this.name = 'CollectorSourceInactiveError';
  }
}

export class CollectorSourceConfigInvalidError extends Error {
  constructor(sourceId: string, reason: string) {
    super(`Source "${sourceId}" has invalid configuration: ${reason}`);
    this.name = 'CollectorSourceConfigInvalidError';
  }
}

const formatValidationReason = (
  errors: Array<{ field: string; message: string }>,
  maxErrors = 3,
): string =>
  errors
    .slice(0, maxErrors)
    .map((entry) => `${entry.field}: ${entry.message}`)
    .join('; ');

export interface LoadCollectorSourceConfigurationParams {
  sourceId: string;
  sourceRegistryRepository: CollectorSourceConfigurationRepository;
}

export const loadCollectorSourceConfiguration = async ({
  sourceId,
  sourceRegistryRepository,
}: LoadCollectorSourceConfigurationParams): Promise<CollectorSourceConfiguration> => {
  const normalizedSourceId = sourceId.trim();
  if (normalizedSourceId.length === 0) {
    throw new Error('sourceId is required for collector execution.');
  }

  const source = await sourceRegistryRepository.getById(normalizedSourceId);
  if (!source) {
    throw new CollectorSourceNotFoundError(normalizedSourceId);
  }

  if (!source.active) {
    throw new CollectorSourceInactiveError(normalizedSourceId);
  }

  const validation = validateSourceSchemaV1(source);
  if (!validation.success) {
    throw new CollectorSourceConfigInvalidError(
      normalizedSourceId,
      formatValidationReason(validation.errors),
    );
  }

  return source;
};
