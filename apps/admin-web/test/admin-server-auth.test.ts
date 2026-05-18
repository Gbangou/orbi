jest.mock('server-only', () => ({}), { virtual: true });

import {
  AdminServerAuthRequiredError,
  buildAdminSessionCookieOptions,
  canUseAdminDemoAccess,
  createAdminServerAuthErrorResponse,
  getAdminSessionCookieName,
  isAdminRole,
} from '../app/admin-server-auth';

describe('admin server auth cookie hardening', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
  });

  it('keeps local development cookies usable on plain localhost', () => {
    setNodeEnv('development');

    expect(getAdminSessionCookieName()).toBe('orbi_admin_session');
    expect(buildAdminSessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/',
      maxAge: 28800,
      priority: 'high',
    });
  });

  it('uses a host-bound secure cookie name in production', () => {
    setNodeEnv('production');

    expect(getAdminSessionCookieName()).toBe('__Host-orbi_admin_session');
    expect(buildAdminSessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 28800,
      priority: 'high',
    });
  });

  it('keeps demo auto sign-in behind the shared runtime flag', () => {
    expect(canUseAdminDemoAccess()).toBe(true);
  });

  it('allows only operational admin roles for explicit admin sessions', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('OPS')).toBe(true);
    expect(isAdminRole('SUPPORT')).toBe(true);
    expect(isAdminRole('DRIVER')).toBe(false);
    expect(isAdminRole('RIDER')).toBe(false);
  });

  it('maps missing admin session errors to no-store 401 responses', async () => {
    const response = createAdminServerAuthErrorResponse(
      new AdminServerAuthRequiredError(),
      'Fallback failure.',
    );

    await expect(response.json()).resolves.toEqual({
      message: 'Admin session is required.',
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });

  it('keeps backend/proxy failures as no-store 502 responses', async () => {
    const response = createAdminServerAuthErrorResponse(
      new Error('upstream down'),
      'Fallback failure.',
    );

    await expect(response.json()).resolves.toEqual({
      message: 'Fallback failure.',
    });
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });
});

function setNodeEnv(value: NodeJS.ProcessEnv['NODE_ENV']) {
  const mutableEnv = process.env as Record<string, string | undefined>;
  mutableEnv.NODE_ENV = value;
}
