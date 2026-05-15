import type { Request } from 'express';
import type { RequestAuthContext } from './auth.types';

export type AuthenticatedRequest = Request & {
  auth?: RequestAuthContext;
};

const safeSessionTokenPattern = /^[A-Za-z0-9._~-]{16,256}$/;

function normalizeSessionToken(token: unknown) {
  if (typeof token !== 'string') {
    return null;
  }

  const normalizedToken = token.trim();

  if (!safeSessionTokenPattern.test(normalizedToken)) {
    return null;
  }

  return normalizedToken;
}

export function extractBearerToken(request: Request) {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    return null;
  }

  const parts = authorizationHeader.trim().split(/\s+/);

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return normalizeSessionToken(parts[1]);
}

export function extractSessionToken(request: Request) {
  const bearerToken = extractBearerToken(request);

  if (bearerToken) {
    return bearerToken;
  }

  const queryToken = request.query.sessionToken;

  return normalizeSessionToken(queryToken);
}
