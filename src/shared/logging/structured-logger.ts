export interface StructuredLoggerSink {
  info: (message: string) => void;
}

export interface StructuredLogger {
  info: (event: string, context?: Record<string, unknown>) => void;
}

const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_KEY_TOKENS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'authorization',
  'cookie',
  'email',
  'phone',
  'mobile',
  'cpf',
  'cnpj',
  'ssn',
  'document',
  'birthdate',
];

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const isSensitiveKey = (key: string): boolean => {
  const normalizedKey = normalizeKey(key);
  return SENSITIVE_KEY_TOKENS.some((token) => normalizedKey.includes(token));
};

const sanitizeValue = (value: unknown, key?: string): unknown => {
  if (key && isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([nestedKey, nestedValue]) => [nestedKey, sanitizeValue(nestedValue, nestedKey)]),
    );
  }

  return value;
};

const normalizeContext = (context: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (!context) {
    return {};
  }

  return sanitizeValue(context) as Record<string, unknown>;
};

export const createStructuredLogger = ({
  component,
  sink = console,
  now = () => new Date().toISOString(),
}: {
  component: string;
  sink?: StructuredLoggerSink;
  now?: () => string;
}): StructuredLogger => {
  const normalizedComponent = component.trim();
  if (normalizedComponent.length === 0) {
    throw new Error('component is required for structured logger.');
  }

  return {
    info: (event: string, context?: Record<string, unknown>) => {
      const payload = {
        level: 'INFO',
        timestamp: now(),
        component: normalizedComponent,
        event,
        ...normalizeContext(context),
      };

      sink.info(JSON.stringify(payload));
    },
  };
};
