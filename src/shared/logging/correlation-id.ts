const CORRELATION_ID_HEADER_KEYS = ['x-correlation-id', 'correlation-id'];

export const resolveCorrelationId = ({
  headers,
  requestId,
  fallback,
}: {
  headers?: Record<string, string | undefined> | null;
  requestId?: string;
  fallback?: string;
}): string | null => {
  if (headers) {
    const normalizedEntries = Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        acc[key.toLowerCase()] = value.trim();
      }
      return acc;
    }, {});

    for (const headerKey of CORRELATION_ID_HEADER_KEYS) {
      const headerValue = normalizedEntries[headerKey];
      if (headerValue) {
        return headerValue;
      }
    }
  }

  if (requestId && requestId.trim().length > 0) {
    return requestId.trim();
  }

  if (fallback && fallback.trim().length > 0) {
    return fallback.trim();
  }

  return null;
};
