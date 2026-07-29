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
    expect(source).toContain('resolveStrictBoundedInteger');
    expect(source).toContain('min: 1');
    expect(source).toContain('max: 168');
    expect(source).toContain('fallback: 24');
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
    expect(source).toContain('fromDate: resolveStrictIsoDate(');
    expect(source).toContain('toDate: resolveStrictIsoDate(');
    expect(source).toContain('search: resolveSearch(');
  });

  it('forwards status and date-range filters to the trips audit dashboard, not just the CSV export', () => {
    // L'audit dashboard (resume risques/argent) ne supportait que lookbackHours:
    // les filtres statut/date collectes dans la barre existante n'affectaient
    // que l'export CSV. Verifie que la route et le board relaient desormais
    // ces filtres a la vue d'audit elle-meme.
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/trips/audit/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain("searchParams.get('status')");
    expect(routeSource).toContain("searchParams.get('fromDate')");
    expect(routeSource).toContain("searchParams.get('toDate')");
    expect(routeSource).toContain('status: resolveTripStatus(');
    expect(routeSource).toContain('fromDate: resolveStrictIsoDate(');
    expect(routeSource).toContain('toDate: resolveStrictIsoDate(');

    const boardSource = readFileSync(
      join(process.cwd(), 'app/trips-audit-board.tsx'),
      'utf8',
    );

    expect(boardSource).toContain('applyAuditFilters');
    expect(boardSource).toContain('Appliquer a l');
  });

  it('uses bounded audit limit choices instead of coercing free-form input', () => {
    const boardSource = readFileSync(
      join(process.cwd(), 'app/trips-audit-board.tsx'),
      'utf8',
    );

    expect(boardSource).toContain('tripsAuditLimitOptions');
    expect(boardSource).toContain('resolveTripsAuditLimit');
    expect(boardSource).not.toContain('setFilterLimit(Number');
  });

  it('keeps trip audit risk resolution guarded and no-store', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/trips/audit/[tripId]/resolve/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('force-dynamic');
    expect(routeSource).toContain('isSafeAdminMutationRequest');
    expect(routeSource).toContain('isSafeOpaqueAdminId');
    expect(routeSource).toContain('createNoStoreAdminHeaders()');
    expect(routeSource).toContain('resolveAdminTripAuditRisk');
    expect(routeSource).toContain('reason.length < 10');
    expect(routeSource).toContain('reason.length > 500');
  });

  it('exposes an audited resolution action for each trip risk', () => {
    const boardSource = readFileSync(
      join(process.cwd(), 'app/trips-audit-board.tsx'),
      'utf8',
    );

    expect(boardSource).toContain('resolveRisk');
    expect(boardSource).toContain('/api/admin/trips/audit/${tripId}/resolve');
    expect(boardSource).toContain('Justification de resolution du risque');
    expect(boardSource).toContain('Cloturer le risque');
    expect(boardSource).toContain('resolvedRiskTripCount');
  });

  it('keeps trip force-close guarded and no-store', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/trips/[tripId]/force-close/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('force-dynamic');
    expect(routeSource).toContain('isSafeAdminMutationRequest');
    expect(routeSource).toContain('isSafeOpaqueAdminId');
    expect(routeSource).toContain('createNoStoreAdminHeaders()');
    expect(routeSource).toContain('forceCloseAdminTrip');
    expect(routeSource).toContain('updateTripStatusWithApi');
    expect(routeSource).toContain("'CANCELLED'");
    expect(routeSource).toContain('reason.length < 10');
    expect(routeSource).toContain('reason.length > 500');
  });

  it('exposes an ops force-close action only for active trips', () => {
    const boardSource = readFileSync(
      join(process.cwd(), 'app/trips-audit-board.tsx'),
      'utf8',
    );

    expect(boardSource).toContain('forceClosableTripStatuses');
    expect(boardSource).toContain('IN_PROGRESS');
    expect(boardSource).toContain('/api/admin/trips/${tripId}/force-close');
    expect(boardSource).toContain('Debloquer la course');
  });

  it('keeps public shared-trip pages private from crawlers and unsafe tokens', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'app/shared/[token]/page.tsx'),
      'utf8',
    );
    const apiSource = readFileSync(
      join(process.cwd(), '../../packages/api/src/trips.ts'),
      'utf8',
    );

    expect(pageSource).toContain('shareTokenPattern');
    expect(pageSource).toContain('isSafeShareToken(token)');
    expect(pageSource).toContain('notFound();');
    expect(pageSource).toContain('name="robots" content="noindex,nofollow,noarchive"');
    expect(pageSource).toContain('name="referrer" content="no-referrer"');
    expect(pageSource).not.toContain('content={`Suivi en direct: ${trip.pickupAddress}');
    expect(apiSource).toContain('encodeURIComponent(shareToken)');
  });
});
