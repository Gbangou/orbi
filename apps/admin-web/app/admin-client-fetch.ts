'use client';

import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from './admin-server-security';

export class AdminClientRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminClientRequestError';
  }
}

export function createAdminMutationHeaders() {
  return {
    [adminMutationHeaderName]: adminMutationHeaderValue,
  };
}

async function resolveAdminErrorMessage(
  response: Response,
  fallback: string,
) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const body = (await response.json()) as { message?: unknown };

      if (typeof body.message === 'string' && body.message.trim()) {
        return body.message.slice(0, 240);
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export async function fetchAdminJson<TResponse>(
  path: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers,
  });

  if (!response.ok) {
    throw new AdminClientRequestError(
      await resolveAdminErrorMessage(
        response,
        `Admin request failed with ${response.status}.`,
      ),
      response.status,
    );
  }

  return (await response.json()) as TResponse;
}

export async function postAdminMutation<TResponse>(
  path: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  headers.set(adminMutationHeaderName, adminMutationHeaderValue);

  return fetchAdminJson<TResponse>(path, {
    ...init,
    method: init?.method ?? 'POST',
    headers,
  });
}
