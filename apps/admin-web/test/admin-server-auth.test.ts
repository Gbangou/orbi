jest.mock('server-only', () => ({}), { virtual: true });

import {
  buildAdminSessionCookieOptions,
  getAdminSessionCookieName,
} from '../app/admin-server-auth';

describe('admin server auth cookie hardening', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('keeps local development cookies usable on plain localhost', () => {
    process.env.NODE_ENV = 'development';

    expect(getAdminSessionCookieName()).toBe('mobilis_admin_session');
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

    expect(getAdminSessionCookieName()).toBe('__Host-mobilis_admin_session');
    expect(buildAdminSessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 28800,
      priority: 'high',
    });
  });
});
