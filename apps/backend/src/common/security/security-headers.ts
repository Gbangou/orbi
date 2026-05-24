import type { Request, Response } from 'express';

// CSP maximale pour une pure API JSON : aucune ressource externe autorisée.
const API_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
].join('; ');

// HSTS 2 ans + includeSubDomains + preload — prêt pour soumission au preload list HSTS.
// Ref: https://hstspreload.org/ (max-age ≥ 31536000 requis)
const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload';

// Toutes les réponses API contiennent des données métier potentiellement sensibles :
// interdire la mise en cache partout, pas seulement sur les routes auth/payments.
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';

function isHttpsRequest(req: Request) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function applyApiSecurityHeaders(request: Request, response: Response) {
  // Fondamentaux anti-sniffing et anti-clickjacking
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Download-Options', 'noopen');
  response.setHeader('X-DNS-Prefetch-Control', 'off');
  response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Isolation et politique de référence
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Origin-Agent-Cluster', '?1');

  // Permissions — géolocalisation accordée uniquement au client légitime, pas à l'API.
  response.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()',
  );

  // CSP stricte + no-cache sur toutes les routes API (données métier)
  if (request.path.startsWith('/api/')) {
    response.setHeader('Content-Security-Policy', API_CSP);
    response.setHeader('Cache-Control', NO_STORE);
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.setHeader('Surrogate-Control', 'no-store');
  }

  // HSTS avec preload sur HTTPS (y compris derrière reverse-proxy avec X-Forwarded-Proto)
  if (isHttpsRequest(request)) {
    response.setHeader('Strict-Transport-Security', HSTS_VALUE);
  }
}
