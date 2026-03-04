import type { CollectorSecretRepository } from '../../domain/collector/load-source-credentials';
import { parseOutboundAuthHeaders } from '../../domain/security/outbound-auth-headers';

const OUTBOUND_AUTH_CACHE_TTL_MS_DEFAULT = 300_000;

export const createSecretsManagerOutboundAuthHeadersResolver = ({
  secretArn,
  secretRepository,
  cacheTtlMs = OUTBOUND_AUTH_CACHE_TTL_MS_DEFAULT,
  nowMs = Date.now,
}: {
  secretArn: string;
  secretRepository: CollectorSecretRepository;
  cacheTtlMs?: number;
  nowMs?: () => number;
}): (() => Promise<Record<string, string>>) => {
  const normalizedSecretArn = secretArn.trim();
  if (normalizedSecretArn.length === 0) {
    throw new Error('secretArn is required for outbound auth headers resolver.');
  }

  if (!Number.isInteger(cacheTtlMs) || cacheTtlMs <= 0) {
    throw new Error('cacheTtlMs must be a positive integer for outbound auth headers resolver.');
  }

  let cachedHeaders: Record<string, string> | null = null;
  let cacheExpiresAtMs = 0;

  return async (): Promise<Record<string, string>> => {
    const nowValue = nowMs();
    if (cachedHeaders && nowValue < cacheExpiresAtMs) {
      return cachedHeaders;
    }

    const secretValue = await secretRepository.getSecretValue(normalizedSecretArn);
    if (secretValue === null) {
      throw new Error(`Outbound auth secret "${normalizedSecretArn}" was not found.`);
    }

    const parsedHeaders = parseOutboundAuthHeaders({
      secretPayload: secretValue,
      secretArn: normalizedSecretArn,
    });

    cachedHeaders = parsedHeaders;
    cacheExpiresAtMs = nowValue + cacheTtlMs;

    return parsedHeaders;
  };
};
