const SECRET_ARN_REGEX =
  /^arn:[^:\s]+:secretsmanager:([^:\s]+):(\d{12}):secret:[A-Za-z0-9/_+=.@-]+$/;

const normalize = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const parseSecretArn = (
  secretArn: string,
): { region: string; accountId: string } | null => {
  const match = SECRET_ARN_REGEX.exec(secretArn.trim());
  if (!match) {
    return null;
  }

  return {
    region: match[1],
    accountId: match[2],
  };
};

export interface SecretArnStagePolicy {
  stage: string;
  allowedRegion: string;
  allowedAccountId?: string;
}

export interface SecretArnStageValidationResult {
  success: true;
}

export interface SecretArnStageValidationFailure {
  success: false;
  reason: string;
}

export type SecretArnStageValidation =
  | SecretArnStageValidationResult
  | SecretArnStageValidationFailure;

export const resolveSecretArnStagePolicy = ({
  stage = process.env.STAGE,
  allowedRegion = process.env.SECRETS_ALLOWED_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    'us-east-1',
  allowedAccountId = process.env.SECRETS_ALLOWED_ACCOUNT_ID,
}: {
  stage?: string;
  allowedRegion?: string;
  allowedAccountId?: string;
} = {}): SecretArnStagePolicy => {
  const normalizedStage = normalize(stage) ?? 'unknown';
  const normalizedRegion = normalize(allowedRegion);
  if (!normalizedRegion) {
    throw new Error('SECRETS_ALLOWED_REGION is required.');
  }

  const normalizedAccountId = normalize(allowedAccountId);
  if (normalizedAccountId && !/^\d{12}$/.test(normalizedAccountId)) {
    throw new Error('SECRETS_ALLOWED_ACCOUNT_ID must be a 12-digit AWS account id.');
  }

  return {
    stage: normalizedStage,
    allowedRegion: normalizedRegion,
    allowedAccountId: normalizedAccountId,
  };
};

export const validateSecretArnAgainstStagePolicy = ({
  secretArn,
  policy,
}: {
  secretArn: string;
  policy: SecretArnStagePolicy;
}): SecretArnStageValidation => {
  const normalizedArn = secretArn.trim();
  const parsed = parseSecretArn(normalizedArn);
  if (!parsed) {
    return {
      success: false,
      reason: 'secretArn must be a valid AWS Secrets Manager ARN.',
    };
  }

  if (parsed.region !== policy.allowedRegion) {
    return {
      success: false,
      reason: `secretArn region "${parsed.region}" is incompatible with stage "${policy.stage}" (expected "${policy.allowedRegion}").`,
    };
  }

  if (policy.allowedAccountId && parsed.accountId !== policy.allowedAccountId) {
    return {
      success: false,
      reason: `secretArn account "${parsed.accountId}" is incompatible with stage "${policy.stage}" (expected "${policy.allowedAccountId}").`,
    };
  }

  return {
    success: true,
  };
};
