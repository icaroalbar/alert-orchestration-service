import { describe, expect, it } from '@jest/globals';

import { parseOutboundAuthHeaders } from '../../../../src/domain/security/outbound-auth-headers';

describe('parseOutboundAuthHeaders', () => {
  it('maps bearer token and api key headers from secret JSON', () => {
    const headers = parseOutboundAuthHeaders({
      secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:outbound',
      secretPayload: JSON.stringify({
        bearerToken: 'token-123',
        apiKey: {
          headerName: 'x-api-key',
          value: 'key-123',
        },
      }),
    });

    expect(headers).toEqual({
      Authorization: 'Bearer token-123',
      'x-api-key': 'key-123',
    });
  });

  it('fails when secret payload is missing credentials', () => {
    expect(() =>
      parseOutboundAuthHeaders({
        secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:outbound',
        secretPayload: JSON.stringify({
          ignored: true,
        }),
      }),
    ).toThrow('must define bearerToken and/or apiKey credentials');
  });

  it('fails when api key shape is incomplete', () => {
    expect(() =>
      parseOutboundAuthHeaders({
        secretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:outbound',
        secretPayload: JSON.stringify({
          apiKeyHeaderName: 'x-api-key',
        }),
      }),
    ).toThrow('must define both apiKey headerName and value');
  });
});
