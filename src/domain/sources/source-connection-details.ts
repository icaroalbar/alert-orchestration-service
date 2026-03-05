import type { SourceSchemaValidationError } from './source-schema';


export interface SourceConnectionDetails {
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
}

const MAX_PORT = 65535;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidPort = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_PORT) ||
  (typeof value === 'string' && /^\d+$/.test(value) && Number.parseInt(value, 10) > 0 &&
    Number.parseInt(value, 10) <= MAX_PORT);

const normalizePort = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_PORT) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (parsed > 0 && parsed <= MAX_PORT) {
      return parsed;
    }
  }

  return undefined;
};

const buildError = (
  field: string,
  code: SourceSchemaValidationError['code'],
  message: string,
): SourceSchemaValidationError => ({
  field,
  code,
  message,
});

export const validateSourceConnectionDetails = (
  input: unknown,
):
  | { success: true; value: SourceConnectionDetails }
  | { success: false; errors: SourceSchemaValidationError[] } => {
  const errors: SourceSchemaValidationError[] = [];

  if (!isRecord(input)) {
    return {
      success: false,
      errors: [
        buildError(
          'connectionDetails',
          'INVALID_TYPE',
          'connectionDetails must be an object containing database credentials.',
        ),
      ],
    };
  }

  const hostValue = input.host;
  const usernameValue = input.username;
  const passwordValue = input.password;
  const databaseValue = input.database;
  const portValue = input.port;

  if (!hasOwnProperty(input, 'host')) {
    errors.push(buildError('connectionDetails.host', 'REQUIRED', 'host is required.'));
  } else if (!isNonEmptyString(hostValue)) {
    errors.push(
      buildError('connectionDetails.host', 'INVALID_TYPE', 'host must be a non-empty string.'),
    );
  }

  if (!hasOwnProperty(input, 'username')) {
    errors.push(buildError('connectionDetails.username', 'REQUIRED', 'username is required.'));
  } else if (!isNonEmptyString(usernameValue)) {
    errors.push(
      buildError('connectionDetails.username', 'INVALID_TYPE', 'username must be a non-empty string.'),
    );
  }

  if (!hasOwnProperty(input, 'password')) {
    errors.push(buildError('connectionDetails.password', 'REQUIRED', 'password is required.'));
  } else if (!isNonEmptyString(passwordValue)) {
    errors.push(
      buildError('connectionDetails.password', 'INVALID_TYPE', 'password must be a non-empty string.'),
    );
  }

  if (!hasOwnProperty(input, 'database')) {
    errors.push(buildError('connectionDetails.database', 'REQUIRED', 'database is required.'));
  } else if (!isNonEmptyString(databaseValue)) {
    errors.push(
      buildError('connectionDetails.database', 'INVALID_TYPE', 'database must be a non-empty string.'),
    );
  }

  let normalizedPort: number | undefined;
  if (hasOwnProperty(input, 'port') && input.port !== undefined && input.port !== null) {
    normalizedPort = normalizePort(portValue);
    if (normalizedPort === undefined) {
      errors.push(
        buildError(
          'connectionDetails.port',
          'INVALID_VALUE',
          'port must be an integer between 1 and 65535.',
        ),
      );
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    value: {
      host: (hostValue as string).trim(),
      username: (usernameValue as string).trim(),
      password: (passwordValue as string).trim(),
      database: (databaseValue as string).trim(),
      port: normalizedPort,
    },
  };
};

const hasOwnProperty = (record: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);
