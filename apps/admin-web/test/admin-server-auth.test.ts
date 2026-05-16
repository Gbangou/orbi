jest.mock('server-only', () => ({}), { virtual: true });

import {
  AdminServerAuthRequiredError,
  buildAdminSessionCookieOptions,
  canUseAdminDemoAccess,
  createAdminServerAuthErrorResponse,
  getAdminSessionCookieName,
} from '../app/admin-server-auth';

describe('admin server auth cookie hardening', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('keeps local development cookies usable on plain localhost', () => {
    process.env.NODE_ENV = 'development';

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
    process.env.NODE_ENV = 'production';

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
