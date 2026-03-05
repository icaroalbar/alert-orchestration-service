import {
  CreateSecretCommand,
  PutSecretValueCommand,
  ResourceExistsException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import type { SourceConnectionDetails } from '../../domain/sources/source-connection-details';

export interface SourceSecretCreatorParams {
  client?: SecretsManagerClient;
  stage?: string;
  serviceName?: string;
}

export interface SourceSecretCreator {
  createSecret(params: {
    sourceId: string;
    connectionDetails: SourceConnectionDetails;
  }): Promise<string>;
}

const isResourceExistsError = (error: unknown): boolean => {
  if (error instanceof ResourceExistsException) {
    return true;
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    return error.name === 'ResourceExistsException';
  }

  return false;
};

const sanitizeId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._+=@\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') ||
  'source';

const buildSecretName = (serviceName: string, stage: string, sourceId: string): string => {
  const normalizedService = serviceName.trim().replace(/[^a-zA-Z0-9-_+=.@]/g, '-') || 'service';
  const normalizedStage = stage.trim().replace(/[^a-zA-Z0-9-_+=.@]/g, '-') || 'stage';
  const normalizedSource = sanitizeId(sourceId);

  return `${normalizedService}-${normalizedStage}-source-${normalizedSource}`;
};

const buildSecretString = (details: SourceConnectionDetails): string =>
  JSON.stringify({
    host: details.host,
    database: details.database,
    username: details.username,
    password: details.password,
    ...(details.port !== undefined ? { port: details.port } : {}),
  });

export const createAwsSourceSecretCreator = (
  params: SourceSecretCreatorParams = {},
): SourceSecretCreator => {
  const client = params.client ?? new SecretsManagerClient({});
  const stage = params.stage ?? process.env.STAGE ?? 'dev';
  const serviceName = params.serviceName ?? process.env.SERVICE_NAME ?? 'alert-orchestration-service';

  return {
    async createSecret({ sourceId, connectionDetails }) {
      const secretName = buildSecretName(serviceName, stage, sourceId);
      const secretString = buildSecretString(connectionDetails);

      try {
        const response = await client.send(
          new CreateSecretCommand({
            Name: secretName,
            SecretString: secretString,
          }),
        );

        if (!response.ARN) {
          throw new Error('Secrets Manager did not return an ARN for the created secret.');
        }

        return response.ARN;
      } catch (error) {
        if (!isResourceExistsError(error)) {
          throw error;
        }

        const update = await client.send(
          new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: secretString,
          }),
        );

        if (!update.ARN) {
          throw new Error('Secrets Manager did not return an ARN when updating the secret.');
        }

        return update.ARN;
      }
    },
  };
};
