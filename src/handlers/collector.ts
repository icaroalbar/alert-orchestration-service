import {
  loadCollectorSourceConfiguration,
  type CollectorSourceConfigurationRepository,
} from '../domain/collector/load-source-configuration';
import { createDynamoDbSourceRegistryRepository } from '../infra/sources/dynamodb-source-registry-repository';
import { nowIso } from '../shared/time/now-iso';

export interface CollectorEvent {
  sourceId: string;
  meta?: {
    executionId?: string;
    stage?: string;
  };
}

export interface CollectorResult {
  sourceId: string;
  processedAt: string;
  recordsSent: number;
}

export interface CollectorDependencies {
  sourceRegistryRepository: CollectorSourceConfigurationRepository;
  now: () => string;
}

let cachedDefaultDependencies: CollectorDependencies | undefined;

const getDefaultDependencies = (): CollectorDependencies => {
  if (cachedDefaultDependencies) {
    return cachedDefaultDependencies;
  }

  const tableName = process.env.SOURCES_TABLE_NAME;
  if (!tableName || tableName.trim().length === 0) {
    throw new Error('SOURCES_TABLE_NAME is required.');
  }

  cachedDefaultDependencies = {
    sourceRegistryRepository: createDynamoDbSourceRegistryRepository({ tableName }),
    now: nowIso,
  };

  return cachedDefaultDependencies;
};

export const createHandler =
  ({ sourceRegistryRepository, now }: CollectorDependencies) =>
  async (event: CollectorEvent): Promise<CollectorResult> => {
    const sourceId = event?.sourceId?.trim() ?? '';
    if (sourceId.length === 0) {
      throw new Error('sourceId is required for collector execution.');
    }

    await loadCollectorSourceConfiguration({
      sourceId,
      sourceRegistryRepository,
    });

    return {
      sourceId,
      processedAt: now(),
      recordsSent: 0,
    };
  };

export async function handler(event: CollectorEvent): Promise<CollectorResult> {
  return createHandler(getDefaultDependencies())(event);
}
