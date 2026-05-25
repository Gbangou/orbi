/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('live-ops board', () => {
  it('keeps the live-ops route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/live-ops/route.ts'),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
    expect(source).toContain('createNoStoreAdminHeaders()');
  });

  it('subscribes to realtime events for live updates', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/live-ops-board.tsx'),
      'utf8',
    );

    expect(source).toContain('subscribeToAdminRealtime');
  });

  it('uses admin-ops-kernel to detect trip changes and triage', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/live-ops-board.tsx'),
      'utf8',
    );

    expect(source).toContain('hasLiveOpsTripChanged');
    expect(source).toContain('resolveLiveOpsTripTriage');
  });

  it('keeps the live sse route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/live/route.ts'),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('getAdminServerAuthSession');
    expect(source).toContain('createAdminServerAuthErrorResponse');
  });
});

describe('feature-flags board', () => {
  it('keeps the feature-flags route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/feature-flags/route.ts'),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
    expect(source).toContain('createNoStoreAdminHeaders()');
  });

  it('subscribes to realtime events for live flag updates', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/feature-flags-board.tsx'),
      'utf8',
    );

    expect(source).toContain('subscribeToAdminRealtime');
  });
});
