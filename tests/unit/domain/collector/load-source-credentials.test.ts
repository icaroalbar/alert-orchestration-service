import { describe, expect, it } from '@jest/globals';

import {
  CollectorSecretAccessError,
  CollectorSecretNotFoundError,
  CollectorSecretPayloadInvalidError,
  loadCollectorSourceCredentials,
} from '../../../../src/domain/collector/load-source-credentials';

type SecretSequenceItem = string | null | Error;

class SequenceSecretRepository {
  public readonly getSecretValueCalls: string[] = [];
  private cursor = 0;

  constructor(private readonly sequence: SecretSequenceItem[]) {}

  getSecretValue(secretArn: string): Promise<string | null> {
    this.getSecretValueCalls.push(secretArn);

    const nextValue = this.sequence[this.cursor] ?? this.sequence[this.sequence.length - 1];
    this.cursor += 1;

    if (nextValue instanceof Error) {
      throw nextValue;
    }

    return Promise.resolve(nextValue);
  }
}

describe('loadCollectorSourceCredentials', () => {
  it('normalizes credentials from secret payload for postgres engine', async () => {
    const repository = new SequenceSecretRepository([
      JSON.stringify({
        host: 'db.internal',
        database: 'customers',
        user: 'collector',
        password: 'super-secret',
      }),
    ]);
    let nowMsCalls = 0;

    const result = await loadCollectorSourceCredentials({
      sourceId: ' source-acme ',
      engine: 'postgres',
      secretArn: ' arn:aws:secretsmanager:us-east-1:123456789012:secret:acme/source-db ',
      secretRepository: repository,
      nowMs: () => {
        nowMsCalls += 1;
        return nowMsCalls === 1 ? 1000 : 1042;
      },
      sleep: () => Promise.resolve(),
    });

    expect(result.credentials).toEqual({
      engine: 'postgres',
      host: 'db.internal',
      port: 5432,
      database: 'customers',
      username: 'collector',
      password: 'super-secret',
    });
    expect(result.metrics).toEqual({
      attempts: 1,
      durationMs: 42,
    });
    expect(repository.getSecretValueCalls).toEqual([
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:acme/source-db',
    ]);
  });

  it('throws controlled error when secret does not exist', async () => {
    const repository = new SequenceSecretRepository([null]);

    await expect(
      loadCollectorSourceCredentials({
        sourceId: 'source-missing-secret',
        engine: 'mysql',
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:missing',
        secretRepository: repository,
      }),
    ).rejects.toBeInstanceOf(CollectorSecretNotFoundError);
  });

  it('throws controlled error when secret payload is invalid', async () => {
    const repository = new SequenceSecretRepository([
      JSON.stringify({
        database: 'customers',
        username: 'collector',
        password: 'super-secret',
      }),
    ]);

    await expect(
      loadCollectorSourceCredentials({
        sourceId: 'source-invalid-secret',
        engine: 'postgres',
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:invalid',
        secretRepository: repository,
      }),
    ).rejects.toBeInstanceOf(CollectorSecretPayloadInvalidError);
  });

  it('retries transient failures with exponential backoff and then succeeds', async () => {
    const throttlingError = new Error('temporary throttling');
    throttlingError.name = 'ThrottlingException';
    const repository = new SequenceSecretRepository([
      throttlingError,
      JSON.stringify({
        host: 'mysql.internal',
        port: '3306',
        dbname: 'crm',
        username: 'collector',
        pass: 'secret-value',
      }),
    ]);
    const sleepCalls: number[] = [];

    const result = await loadCollectorSourceCredentials({
      sourceId: 'source-retry',
      engine: 'mysql',
      secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:mysql',
      secretRepository: repository,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 50,
        backoffRate: 2,
      },
      nowMs: (() => {
        let calls = 0;
        return () => {
          calls += 1;
          return calls === 1 ? 2000 : 2100;
        };
      })(),
      sleep: (delayMs) => {
        sleepCalls.push(delayMs);
        return Promise.resolve();
      },
    });

    expect(result.credentials).toEqual({
      engine: 'mysql',
      host: 'mysql.internal',
      port: 3306,
      database: 'crm',
      username: 'collector',
      password: 'secret-value',
    });
    expect(result.metrics.attempts).toBe(2);
    expect(sleepCalls).toEqual([50]);
  });

  it('fails with controlled access error when transient failure exhausts retry attempts', async () => {
    const timeoutError = new Error('socket timeout');
    timeoutError.name = 'TimeoutError';

    const repository = new SequenceSecretRepository([timeoutError, timeoutError, timeoutError]);
    const sleepCalls: number[] = [];

    await expect(
      loadCollectorSourceCredentials({
        sourceId: 'source-timeout',
        engine: 'postgres',
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:timeout',
        secretRepository: repository,
        retryPolicy: {
          maxAttempts: 3,
          baseDelayMs: 25,
          backoffRate: 2,
        },
        sleep: (delayMs) => {
          sleepCalls.push(delayMs);
          return Promise.resolve();
        },
      }),
    ).rejects.toBeInstanceOf(CollectorSecretAccessError);

    expect(sleepCalls).toEqual([25, 50]);
  });
});
