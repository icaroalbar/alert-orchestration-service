const HEADER_NAME_REGEX = /^[A-Za-z0-9-]+$/;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const resolveApiKeyHeaderName = (payload: Record<string, unknown>): string | null => {
  const topLevelHeaderName = payload.apiKeyHeaderName;
  if (isNonEmptyString(topLevelHeaderName)) {
    return topLevelHeaderName.trim();
  }

  const apiKeyPayload = payload.apiKey;
  if (typeof apiKeyPayload !== 'object' || apiKeyPayload === null) {
    return null;
  }

  const nestedHeaderName = (apiKeyPayload as Record<string, unknown>).headerName;
  return isNonEmptyString(nestedHeaderName) ? nestedHeaderName.trim() : null;
};

const resolveApiKeyValue = (payload: Record<string, unknown>): string | null => {
  const topLevelValue = payload.apiKeyValue;
  if (isNonEmptyString(topLevelValue)) {
    return topLevelValue.trim();
  }

  const apiKeyPayload = payload.apiKey;
  if (typeof apiKeyPayload !== 'object' || apiKeyPayload === null) {
    return null;
  }

  const nestedValue = (apiKeyPayload as Record<string, unknown>).value;
  return isNonEmptyString(nestedValue) ? nestedValue.trim() : null;
};

export const parseOutboundAuthHeaders = ({
  secretPayload,
  secretArn,
}: {
  secretPayload: string;
  secretArn: string;
}): Record<string, string> => {
  const normalizedSecretPayload = secretPayload.trim();
  if (normalizedSecretPayload.length === 0) {
    throw new Error(`Outbound auth secret "${secretArn}" is empty.`);
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(normalizedSecretPayload);
  } catch {
    throw new Error(`Outbound auth secret "${secretArn}" must be valid JSON.`);
  }

  if (typeof parsedPayload !== 'object' || parsedPayload === null || Array.isArray(parsedPayload)) {
    throw new Error(`Outbound auth secret "${secretArn}" must be a JSON object.`);
  }

  const payload = parsedPayload as Record<string, unknown>;
  const headers: Record<string, string> = {};

  const bearerToken = payload.bearerToken;
  if (isNonEmptyString(bearerToken)) {
    headers.Authorization = `Bearer ${bearerToken.trim()}`;
  }

  const apiKeyHeaderName = resolveApiKeyHeaderName(payload);
  const apiKeyValue = resolveApiKeyValue(payload);
  if (apiKeyHeaderName && apiKeyValue) {
    if (!HEADER_NAME_REGEX.test(apiKeyHeaderName)) {
      throw new Error(
        `Outbound auth secret "${secretArn}" contains invalid apiKey headerName "${apiKeyHeaderName}".`,
      );
    }

    headers[apiKeyHeaderName] = apiKeyValue;
  } else if (apiKeyHeaderName || apiKeyValue) {
    throw new Error(
      `Outbound auth secret "${secretArn}" must define both apiKey headerName and value.`,
    );
  }

  if (Object.keys(headers).length === 0) {
    throw new Error(
      `Outbound auth secret "${secretArn}" must define bearerToken and/or apiKey credentials.`,
    );
  }

  return headers;
};
