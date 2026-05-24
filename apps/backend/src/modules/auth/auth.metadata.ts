import type { Request } from 'express';

export type AuthRequestMetadata = {
  userAgent?: string;
  ipAddress?: string;
};

function normalizeHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(', ') : value;
}

// L'analyse de la requête HTTP est isolée ici pour que le service d'auth
// ne reçoive que des métadonnées explicites et sûres à persister.
export function extractAuthRequestMetadata(
  request: Request,
): AuthRequestMetadata {
  return {
    userAgent: normalizeHeaderValue(request.headers['user-agent']),
    ipAddress: request.ip,
  };
}
