/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('trips audit board', () => {
  it('bounds lookback hours to a safe integer range before proxying', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/trips/audit/route.ts'),
      'utf8',
    );

    expect(source).toContain('resolveLookbackHours');
    expect(source).toContain('Number.isInteger(parsed)');
    expect(source).toContain('parsed >= 1');
    expect(source).toContain('parsed <= 168');
  });

  it('keeps the trips audit route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/trips/audit/route.ts'),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('createNoStoreAdminHeaders()');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
  });

  it('bounds lookback hours to a safe integer range in the trips audit board', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/trips-audit-board.tsx'),
      'utf8',
    );

    expect(source).toContain('lookbackHours');
  });

  it('keeps the trips CSV export route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/trips/export.csv/route.ts'),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('createNoStoreAdminHeaders()');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
  });
});
