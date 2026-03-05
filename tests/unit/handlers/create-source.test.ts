import { describe, expect, it } from '@jest/globals';

import type { SourceConnectionDetails } from '../../../src/domain/sources/source-connection-details';
import {
  SourceAlreadyExistsError,
  type SourceRegistryRecord,
  type SourceRegistryRepository,
} from '../../../src/domain/sources/source-registry-repository';
import type { SourceSecretCreator } from '../../../src/infra/secrets/source-secret-creator';
import { createHandler } from '../../../src/handlers/create-source';

const VALID_INTERVAL_SOURCE = {
  sourceId: 'source-acme',
  active: true,
  engine: 'postgres',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:acme/source-db',
  query: 'select * from customers where updated_at > {{cursor}}',
  cursorField: 'updated_at',
  fieldMap: {
    id: 'customer_id',
    email: 'email',
  },
  scheduleType: 'interval',
  intervalMinutes: 30,
} as const;

const tenantRequestContext = (requestId?: string) => ({
  requestId,
  authorizer: {
    jwt: {
      claims: {
        tenant_id: 'tenant-acme',
      },
    },
  },
});

class SpySourceRegistryRepository implements SourceRegistryRepository {
  public readonly created: SourceRegistryRecord[] = [];

  constructor(private readonly shouldFailWith?: Error) {}

  create(source: SourceRegistryRecord): Promise<void> {
    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }

    this.created.push(source);
    return Promise.resolve();
  }

  getById(sourceId: string): Promise<SourceRegistryRecord | null> {
    const found = this.created.find((item) => item.sourceId === sourceId);
    return Promise.resolve(found ?? null);
  }

  list(): Promise<{ items: SourceRegistryRecord[]; nextToken: string | null }> {
    return Promise.resolve({
      items: this.created,
      nextToken: null,
    });
  }

  update(): Promise<void> {
    return Promise.resolve();
  }
}

class SpySourceSecretCreator implements SourceSecretCreator {
  public readonly calls: Array<{
    sourceId: string;
    connectionDetails: SourceConnectionDetails;
  }> = [];

  constructor(private readonly arn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:generated') {}

  createSecret(params: {
    sourceId: string;
    connectionDetails: SourceConnectionDetails;
  }): Promise<string> {
    this.calls.push(params);
    return Promise.resolve(this.arn);
  }
}

class FailingSourceSecretCreator implements SourceSecretCreator {
  createSecret(): Promise<string> {
    return Promise.reject(new Error('secrets fail'));
  }
}

const makeHandlerWithDependencies = (options?: {
  repository?: SpySourceRegistryRepository;
  secretCreator?: SourceSecretCreator;
}) => {
  const repository = options?.repository ?? new SpySourceRegistryRepository();
  const secretCreator = options?.secretCreator ?? new SpySourceSecretCreator();

  return {
    handler: createHandler({
      sourceRegistryRepository: repository,
      now: () => '2026-03-03T12:00:00.000Z',
      sourceSecretCreator: secretCreator,
    }),
    repository,
    secretCreator,
  };
};

describe('create-source handler', () => {
  it('creates source and returns 201 with metadata', async () => {
    const secretCreator = new SpySourceSecretCreator();
    const { handler, repository } = makeHandlerWithDependencies({ secretCreator });

    const result = await handler({
      body: JSON.stringify(VALID_INTERVAL_SOURCE),
      requestContext: tenantRequestContext('req-40'),
    });

    expect(result.statusCode).toBe(201);
    expect(result.headers['content-type']).toBe('application/json');
    expect(JSON.parse(result.body)).toEqual({
      sourceId: 'source-acme',
      metadata: {
        schemaVersion: '1.0.0',
        createdAt: '2026-03-03T12:00:00.000Z',
        updatedAt: '2026-03-03T12:00:00.000Z',
        requestId: 'req-40',
      },
    });
    expect(repository.created).toHaveLength(1);
    expect(repository.created[0]).toMatchObject({
      tenantId: 'tenant-acme',
      sourceId: 'source-acme',
      nextRunAt: '2026-03-03T12:30:00.000Z',
      schemaVersion: '1.0.0',
      createdAt: '2026-03-03T12:00:00.000Z',
      updatedAt: '2026-03-03T12:00:00.000Z',
    });
    expect(secretCreator.calls).toHaveLength(0);
  });

  it('calculates nextRunAt for cron schedules in UTC', async () => {
    const { handler, repository } = makeHandlerWithDependencies();

    const result = await handler({
      body: JSON.stringify({
        ...VALID_INTERVAL_SOURCE,
        scheduleType: 'cron',
        intervalMinutes: undefined,
        cronExpr: '0 */15 * * * *',
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(201);
    expect(repository.created[0]?.nextRunAt).toBe('2026-03-03T12:15:00.000Z');
  });

  it('returns 400 when payload validation fails', async () => {
    const { handler, repository } = makeHandlerWithDependencies();

    const result = await handler({
      body: JSON.stringify({
        ...VALID_INTERVAL_SOURCE,
        sourceId: '',
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(400);
    const parsedBody = JSON.parse(result.body) as {
      message: string;
      errors: Array<{ field: string }>;
    };
    expect(parsedBody.message).toBe('Source payload validation failed.');
    expect(parsedBody.errors.some((entry) => entry.field === 'sourceId')).toBe(true);
    expect(repository.created).toHaveLength(0);
  });

  it('returns 400 when secretArn is incompatible with stage policy', async () => {
    const previousRegion = process.env.SECRETS_ALLOWED_REGION;
    const previousAccount = process.env.SECRETS_ALLOWED_ACCOUNT_ID;
    process.env.SECRETS_ALLOWED_REGION = 'us-east-1';
    process.env.SECRETS_ALLOWED_ACCOUNT_ID = '123456789012';

      try {
        const repository = new SpySourceRegistryRepository();
        const { handler } = makeHandlerWithDependencies({ repository });

        const result = await handler({
        body: JSON.stringify({
          ...VALID_INTERVAL_SOURCE,
          secretArn: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:acme/source-db',
        }),
        requestContext: tenantRequestContext(),
      });

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        message:
          'secretArn region "us-west-2" is incompatible with stage "unknown" (expected "us-east-1").',
        code: 'SECRET_ARN_STAGE_MISMATCH',
      });
      expect(repository.created).toHaveLength(0);
    } finally {
      if (previousRegion === undefined) {
        delete process.env.SECRETS_ALLOWED_REGION;
      } else {
        process.env.SECRETS_ALLOWED_REGION = previousRegion;
      }

      if (previousAccount === undefined) {
        delete process.env.SECRETS_ALLOWED_ACCOUNT_ID;
      } else {
        process.env.SECRETS_ALLOWED_ACCOUNT_ID = previousAccount;
      }
    }
  });

  it('returns 400 when body is invalid json', async () => {
    const { handler } = makeHandlerWithDependencies();

    const result = await handler({
      body: '{invalid-json',
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Request body must be valid JSON.',
    });
  });

  it('returns 409 when source already exists', async () => {
    const repository = new SpySourceRegistryRepository(
      new SourceAlreadyExistsError('source-acme'),
    );
    const { handler } = makeHandlerWithDependencies({ repository });

    const result = await handler({
      body: JSON.stringify(VALID_INTERVAL_SOURCE),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Source "source-acme" already exists.',
      code: 'SOURCE_ALREADY_EXISTS',
    });
  });

  it('returns 500 for unexpected repository errors', async () => {
    const repository = new SpySourceRegistryRepository(new Error('network timeout'));
    const { handler } = makeHandlerWithDependencies({ repository });

    const result = await handler({
      body: JSON.stringify(VALID_INTERVAL_SOURCE),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Failed to create source.',
    });
  });

  it('returns 400 when cron expression is invalid', async () => {
    const { handler } = makeHandlerWithDependencies();

    const result = await handler({
      body: JSON.stringify({
        ...VALID_INTERVAL_SOURCE,
        scheduleType: 'cron',
        intervalMinutes: undefined,
        cronExpr: 'invalid cron',
      }),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(400);
    const parsedBody = JSON.parse(result.body) as {
      message: string;
      errors: Array<{ field: string; code: string }>;
    };
    expect(parsedBody.message).toBe('Source payload validation failed.');
    expect(parsedBody.errors).toContainEqual(
      expect.objectContaining({
        field: 'cronExpr',
        code: 'INVALID_FORMAT',
      }),
    );
  });

  it('creates secret when connectionDetails are provided instead of secretArn', async () => {
    const stubArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:generated-conn';
    const secretCreator = new SpySourceSecretCreator(stubArn);
    const { handler, repository } = makeHandlerWithDependencies({ secretCreator });

    const payload = {
      ...VALID_INTERVAL_SOURCE,
      secretArn: undefined,
      connectionDetails: {
        host: 'source-db.internal',
        database: 'customers',
        username: 'collector',
        password: 'super-secret',
        port: 5432,
      },
    };

    const result = await handler({
      body: JSON.stringify(payload),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(201);
    expect(repository.created[0].secretArn).toBe(stubArn);
    expect(secretCreator.calls).toHaveLength(1);
    expect(secretCreator.calls[0]).toMatchObject({
      sourceId: 'source-acme',
      connectionDetails: {
        host: 'source-db.internal',
        database: 'customers',
        username: 'collector',
        password: 'super-secret',
        port: 5432,
      },
    });
  });

  it('returns 400 when neither secretArn nor connectionDetails are sent', async () => {
    const { handler } = makeHandlerWithDependencies();

    const payload = {
      ...VALID_INTERVAL_SOURCE,
      secretArn: undefined,
    };

    const result = await handler({
      body: JSON.stringify(payload),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as { errors: Array<{ field: string }> };
    expect(parsed.errors.some((error) => error.field === 'secretArn')).toBe(true);
  });

  it('returns 400 when connectionDetails payload is invalid', async () => {
    const { handler } = makeHandlerWithDependencies();

    const payload = {
      ...VALID_INTERVAL_SOURCE,
      secretArn: undefined,
      connectionDetails: {
        host: '',
        database: 'customers',
        username: 'collector',
        password: 'secret',
      },
    };

    const result = await handler({
      body: JSON.stringify(payload),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as { errors: Array<{ field: string }> };
    expect(parsed.errors.some((error) => error.field === 'connectionDetails.host')).toBe(true);
  });

  it('returns 500 when secret creation fails', async () => {
    const { handler } = makeHandlerWithDependencies({
      secretCreator: new FailingSourceSecretCreator(),
    });

    const payload = {
      ...VALID_INTERVAL_SOURCE,
      secretArn: undefined,
      connectionDetails: {
        host: 'source-db.internal',
        database: 'customers',
        username: 'collector',
        password: 'super-secret',
      },
    };

    const result = await handler({
      body: JSON.stringify(payload),
      requestContext: tenantRequestContext(),
    });

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Failed to create source secret.' });
  });
});
