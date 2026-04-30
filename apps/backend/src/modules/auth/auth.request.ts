import type { Request } from 'express';
import type { RequestAuthContext } from './auth.types';

export type AuthenticatedRequest = Request & {
  auth?: RequestAuthContext;
};

export function extractBearerToken(request: Request) {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token.trim();
}

export function extractSessionToken(request: Request) {
  const bearerToken = extractBearerToken(request);

  if (bearerToken) {
    return bearerToken;
  }

  const queryToken = request.query.sessionToken;

  if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
    return queryToken.trim();
  }

  return null;
}
