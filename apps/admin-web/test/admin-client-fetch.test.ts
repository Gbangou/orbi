/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import {
  AdminClientRequestError,
  createAdminMutationHeaders,
  fetchAdminJson,
  postAdminMutation,
} from '../app/admin-client-fetch';
import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from '../app/admin-server-security';

describe('admin client fetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates the explicit admin mutation header', () => {
    expect(createAdminMutationHeaders()).toEqual({
      [adminMutationHeaderName]: adminMutationHeaderValue,
    });
  });

  it('keeps admin reads no-store and requests JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    global.fetch = fetchMock;

    await expect(fetchAdminJson('/api/admin/health')).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/health',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('preserves bounded server error messages for operator feedback', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid health incident id.' }), {
        headers: { 'content-type': 'application/json' },
        status: 400,
      }),
    );

    await expect(fetchAdminJson('/api/admin/health-incidents/bad/mute'))
      .rejects.toMatchObject({
        message: 'Invalid health incident id.',
        status: 400,
      } satisfies Partial<AdminClientRequestError>);
  });

  it('adds mutation guard headers to admin posts', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ replay: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    global.fetch = fetchMock;

    await postAdminMutation('/api/admin/payment-webhook-events/event-1/replay');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(init.method).toBe('POST');
    expect(headers.get(adminMutationHeaderName)).toBe(
      adminMutationHeaderValue,
    );
  });
});
