export interface JwtAuthorizerContext {
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  };
}

const CLAIM_CANDIDATES = ['tenant_id', 'tenantId'] as const;

const asTenantId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const resolveTenantIdFromJwtClaims = (event: JwtAuthorizerContext): string | null => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) {
    return null;
  }

  for (const claimName of CLAIM_CANDIDATES) {
    const tenantId = asTenantId(claims[claimName]);
    if (tenantId) {
      return tenantId;
    }
  }

  return null;
};
