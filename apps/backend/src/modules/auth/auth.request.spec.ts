import { extractBearerToken, extractSessionToken } from './auth.request';

describe('auth.request', () => {
  it('extracts a valid bearer token from the authorization header', () => {
    const token = extractBearerToken({
      headers: {
        authorization: 'Bearer session-token-123',
      },
    } as never);

    expect(token).toBe('session-token-123');
  });

  it('returns null when the header is missing or malformed', () => {
    expect(
      extractBearerToken({
        headers: {},
      } as never),
    ).toBeNull();

    expect(
      extractBearerToken({
        headers: {
          authorization: 'Basic abc123',
        },
      } as never),
    ).toBeNull();
  });

  it('extracts the SSE session token from the query string when no bearer token is present', () => {
    const token = extractSessionToken({
      headers: {},
      query: {
        sessionToken: 'session-token-sse-456',
      },
    } as never);

    expect(token).toBe('session-token-sse-456');
  });
});
