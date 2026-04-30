import type { Request } from 'express';

export type AuthRequestMetadata = {
  userAgent?: string;
  ipAddress?: string;
};

function normalizeHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(', ') : value;
}

// Keep transport-specific request parsing out of the controller actions so the
// auth service only receives explicit metadata it can persist safely.
export function extractAuthRequestMetadata(
  request: Request,
): AuthRequestMetadata {
  return {
    userAgent: normalizeHeaderValue(request.headers['user-agent']),
    ipAddress: request.ip,
  };
}
