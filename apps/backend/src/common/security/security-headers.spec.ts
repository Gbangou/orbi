import { applyApiSecurityHeaders } from './security-headers';

function createResponse() {
  const headers = new Map<string, string>();

  return {
    headers,
    response: {
      setHeader: jest.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
    },
  };
}

describe('applyApiSecurityHeaders', () => {
  it('sets strict browser headers for API responses', () => {
    const { headers, response } = createResponse();

    applyApiSecurityHeaders(
      {
        path: '/api/v1/riders/me',
        secure: false,
        headers: {},
      } as never,
      response as never,
    );

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-DNS-Prefetch-Control')).toBe('off');
    expect(headers.get('X-Download-Options')).toBe('noopen');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    expect(headers.has('Strict-Transport-Security')).toBe(false);
  });

  it('prevents caching on auth, admin, and payment surfaces', () => {
    for (const path of [
      '/api/v1/auth/sign-in',
      '/api/v1/admin/job-queue',
      '/api/v1/payments/checkout-intents',
    ]) {
      const { headers, response } = createResponse();

      applyApiSecurityHeaders(
        {
          path,
          secure: true,
          headers: {},
        } as never,
        response as never,
      );

      expect(headers.get('Cache-Control')).toBe('no-store, max-age=0');
      expect(headers.get('Pragma')).toBe('no-cache');
      expect(headers.get('Strict-Transport-Security')).toContain(
        'max-age=31536000',
      );
    }
  });

  it('does not trust raw forwarded proto headers for HSTS', () => {
    const { headers, response } = createResponse();

    applyApiSecurityHeaders(
      {
        path: '/api/v1/health',
        secure: false,
        headers: { 'x-forwarded-proto': 'https' },
      } as never,
      response as never,
    );

    expect(headers.has('Strict-Transport-Security')).toBe(false);
  });

  it('sets HSTS when Express marks the request as secure', () => {
    const { headers, response } = createResponse();

    applyApiSecurityHeaders(
      {
        path: '/api/v1/health',
        secure: true,
        headers: {},
      } as never,
      response as never,
    );

    expect(headers.get('Strict-Transport-Security')).toContain(
      'includeSubDomains',
    );
  });
});
