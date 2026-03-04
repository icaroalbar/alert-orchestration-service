import { describe, expect, it } from '@jest/globals';
import {
  resolveSecretArnStagePolicy,
  validateSecretArnAgainstStagePolicy,
} from '../../../../src/shared/security/secret-arn-stage-policy';

describe('secret arn stage policy', () => {
  it('validates compatible secret arn for stage policy', () => {
    const policy = resolveSecretArnStagePolicy({
      stage: 'dev',
      allowedRegion: 'us-east-1',
      allowedAccountId: '123456789012',
    });

    const result = validateSecretArnAgainstStagePolicy({
      secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:acme/source-db',
      policy,
    });

    expect(result).toEqual({ success: true });
  });

  it('rejects secret arn when region does not match stage policy', () => {
    const policy = resolveSecretArnStagePolicy({
      stage: 'stg',
      allowedRegion: 'us-east-1',
      allowedAccountId: '123456789012',
    });

    const result = validateSecretArnAgainstStagePolicy({
      secretArn: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:acme/source-db',
      policy,
    });

    expect(result).toEqual({
      success: false,
      reason:
        'secretArn region "us-west-2" is incompatible with stage "stg" (expected "us-east-1").',
    });
  });

  it('rejects secret arn when account does not match stage policy', () => {
    const policy = resolveSecretArnStagePolicy({
      stage: 'prod',
      allowedRegion: 'us-east-1',
      allowedAccountId: '123456789012',
    });

    const result = validateSecretArnAgainstStagePolicy({
      secretArn: 'arn:aws:secretsmanager:us-east-1:999999999999:secret:acme/source-db',
      policy,
    });

    expect(result).toEqual({
      success: false,
      reason:
        'secretArn account "999999999999" is incompatible with stage "prod" (expected "123456789012").',
    });
  });

  it('allows account-agnostic policy when allowedAccountId is omitted', () => {
    const policy = resolveSecretArnStagePolicy({
      stage: 'dev',
      allowedRegion: 'us-east-1',
    });

    const result = validateSecretArnAgainstStagePolicy({
      secretArn: 'arn:aws:secretsmanager:us-east-1:999999999999:secret:acme/source-db',
      policy,
    });

    expect(result).toEqual({ success: true });
  });
});
