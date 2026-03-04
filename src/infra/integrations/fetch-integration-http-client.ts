import type { IntegrationHttpClient } from './external-api-client';

export const createFetchIntegrationHttpClient = (): IntegrationHttpClient => {
  return async ({ url, method, headers, body, timeoutMs }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      return {
        status: response.status,
        text: () => response.text(),
      };
    } finally {
      clearTimeout(timeout);
    }
  };
};
