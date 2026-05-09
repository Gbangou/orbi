import type { Request, Response } from 'express';

const API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function isHttpsRequest(request: Request) {
  return request.secure;
}

function isSensitiveApiPath(path: string) {
  return (
    path.startsWith('/api/v1/auth') ||
    path.startsWith('/api/v1/admin') ||
    path.startsWith('/api/v1/payments')
  );
}

export function applyApiSecurityHeaders(request: Request, response: Response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-DNS-Prefetch-Control', 'off');
  response.setHeader('X-Download-Options', 'noopen');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Origin-Agent-Cluster', '?1');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  if (request.path.startsWith('/api/')) {
    response.setHeader('Content-Security-Policy', API_CONTENT_SECURITY_POLICY);
  }

  if (isSensitiveApiPath(request.path)) {
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
  }

  if (isHttpsRequest(request)) {
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
}
