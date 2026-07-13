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

  it('forwards the date-range and search export filters instead of silently dropping them', () => {
    // Le board collectait deja fromDate/toDate/search dans l'URL d'export,
    // mais la route serveur ne lisait que status/limit avant de proxyer vers
    // le backend: un ops filtrant par date ou par nom recevait un export non
    // filtre sans aucun signal d'erreur. Verifie que les trois filtres sont
    // desormais lus et transmis au backend.
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/trips/export.csv/route.ts'),
      'utf8',
    );

    expect(source).toContain("searchParams.get('fromDate')");
    expect(source).toContain("searchParams.get('toDate')");
    expect(source).toContain("searchParams.get('search')");
    expect(source).toContain('fromDate: resolveIsoDate(');
    expect(source).toContain('toDate: resolveIsoDate(');
    expect(source).toContain('search: resolveSearch(');
  });
});
