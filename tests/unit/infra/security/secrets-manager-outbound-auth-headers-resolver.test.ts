import { describe, expect, it } from '@jest/globals';

import type { CollectorSecretRepository } from '../../../../src/domain/collector/load-source-credentials';
import { createSecretsManagerOutboundAuthHeadersResolver } from '../../../../src/infra/security/secrets-manager-outbound-auth-headers-resolver';

class SpySecretRepository implements CollectorSecretRepository {
  public readonly getSecretValueCalls: string[] = [];

  constructor(private readonly valueByArn: Map<string, string | null>) {}

  getSecretValue(secretArn: string): Promise<string | null> {
    this.getSecretValueCalls.push(secretArn);
    return Promise.resolve(this.valueByArn.get(secretArn) ?? null);
  }
}

describe('createSecretsManagerOutboundAuthHeadersResolver', () => {
  it('loads and caches auth headers from secrets manager payload', async () => {
    const secretArn = 'arn:aws:secretsmanager:us-east-1:123:secret:outbound';
    const secretRepository = new SpySecretRepository(
      new Map<string, string | null>([
        [
          secretArn,
          JSON.stringify({
            bearerToken: 'token-123',
          }),
        ],
      ]),
    );

    const resolver = createSecretsManagerOutboundAuthHeadersResolver({
      secretArn,
      secretRepository,
      cacheTtlMs: 1000,
      nowMs: (() => {
        let current = 100;
        return () => {
          current += 100;
          return current;
        };
      })(),
    });

    await expect(resolver()).resolves.toEqual({
      Authorization: 'Bearer token-123',
    });
    await expect(resolver()).resolves.toEqual({
      Authorization: 'Bearer token-123',
    });

    expect(secretRepository.getSecretValueCalls).toEqual([secretArn]);
  });

  it('fails with controlled error when secret is missing', async () => {
    const secretArn = 'arn:aws:secretsmanager:us-east-1:123:secret:missing';
    const secretRepository = new SpySecretRepository(new Map([[secretArn, null]]));

    const resolver = createSecretsManagerOutboundAuthHeadersResolver({
      secretArn,
      secretRepository,
    });

    await expect(resolver()).rejects.toThrow(`Outbound auth secret "${secretArn}" was not found.`);
  });
});
