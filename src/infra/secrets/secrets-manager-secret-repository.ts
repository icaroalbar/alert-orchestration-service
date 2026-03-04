import {
  GetSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import type { CollectorSecretRepository } from '../../domain/collector/load-source-credentials';

const isResourceNotFoundError = (error: unknown): boolean => {
  if (error instanceof ResourceNotFoundException) {
    return true;
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    return error.name === 'ResourceNotFoundException';
  }

  return false;
};

const resolveSecretPayload = ({
  secretString,
  secretBinary,
}: {
  secretString: string | undefined;
  secretBinary: Uint8Array | undefined;
}): string => {
  if (typeof secretString === 'string') {
    return secretString;
  }

  if (secretBinary) {
    return Buffer.from(secretBinary).toString('utf-8');
  }

  return '';
};

export interface SecretsManagerSecretRepositoryParams {
  client?: SecretsManagerClient;
}

export const createSecretsManagerSecretRepository = ({
  client = new SecretsManagerClient({}),
}: SecretsManagerSecretRepositoryParams = {}): CollectorSecretRepository => ({
  async getSecretValue(secretArn: string): Promise<string | null> {
    try {
      const response = await client.send(
        new GetSecretValueCommand({
          SecretId: secretArn,
        }),
      );

      return resolveSecretPayload({
        secretString: response.SecretString,
        secretBinary: response.SecretBinary,
      });
    } catch (error) {
      if (isResourceNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  },
});
