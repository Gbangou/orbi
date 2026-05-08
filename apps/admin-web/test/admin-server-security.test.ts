import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../app/admin-server-security';

function request(headers: Record<string, string>, method = 'POST') {
  return {
    method,
    nextUrl: {
      origin: 'http://localhost:3001',
    },
    headers: new Headers(headers),
  };
}

describe('admin server security', () => {
  it('requires an explicit same-origin admin mutation header', () => {
    expect(
      isSafeAdminMutationRequest(
        request({
          [adminMutationHeaderName]: adminMutationHeaderValue,
          origin: 'http://localhost:3001',
          'sec-fetch-site': 'same-origin',
        }) as never,
      ),
    ).toBe(true);

    expect(
      isSafeAdminMutationRequest(
        request({
          origin: 'http://localhost:3001',
          'sec-fetch-site': 'same-origin',
        }) as never,
      ),
    ).toBe(false);
  });

  it('rejects cross-site admin mutations even with the custom header present', () => {
    expect(
      isSafeAdminMutationRequest(
        request({
          [adminMutationHeaderName]: adminMutationHeaderValue,
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        }) as never,
      ),
    ).toBe(false);
  });

  it('allows safe read methods without a mutation header', () => {
    expect(isSafeAdminMutationRequest(request({}, 'GET') as never)).toBe(true);
  });

  it('bounds opaque route identifiers before proxying to the backend', () => {
    expect(isSafeOpaqueAdminId('job-dead-1')).toBe(true);
    expect(isSafeOpaqueAdminId('clv1234567890abcdef')).toBe(true);
    expect(isSafeOpaqueAdminId('../job-dead-1')).toBe(false);
    expect(isSafeOpaqueAdminId('<script>')).toBe(false);
    expect(isSafeOpaqueAdminId('a'.repeat(120))).toBe(false);
  });
});
