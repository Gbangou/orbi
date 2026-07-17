/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('drivers board', () => {
  it('guards driver actions against duplicate in-flight requests', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/drivers-board.tsx'),
      'utf8',
    );

    expect(source).toContain('inFlightRef');
    expect(source).toContain('inFlightRef.current.has(driverId)');
    expect(source).toContain('inFlightRef.current.add(driverId)');
    expect(source).toContain('inFlightRef.current.delete(driverId)');
  });

  it('enforces a minimum suspension reason length before calling the backend', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/drivers-board.tsx'),
      'utf8',
    );

    expect(source).toContain('reason.length < 10');
    expect(source).toContain('suspendReason.trim().length < 10');
  });

  it('requires a two-step confirm before suspending a driver', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/drivers-board.tsx'),
      'utf8',
    );

    expect(source).toContain('confirmingDriverId');
    expect(source).toContain('setConfirmingDriverId(driver.id)');
    expect(source).toContain('setConfirmingDriverId(null)');
  });

  it('sends the mutation guard header on suspend and reactivate requests', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/drivers-board.tsx'),
      'utf8',
    );

    expect(source).toContain('createAdminMutationHeaders');
    const suspendBlock = source.slice(
      source.indexOf('async function suspendDriver'),
      source.indexOf('async function reactivateDriver'),
    );
    const reactivateBlock = source.slice(
      source.indexOf('async function reactivateDriver'),
      source.indexOf('const DRIVER_STATUS_LABELS'),
    );

    expect(suspendBlock).toContain('createAdminMutationHeaders()');
    expect(reactivateBlock).toContain('createAdminMutationHeaders()');
  });

  it('normalises the suspension payload and rejects short reasons in the route handler', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/drivers/[driverId]/suspend/route.ts'),
      'utf8',
    );

    expect(source).toContain('normalizeSuspensionPayload');
    expect(source).toContain('reason.length < 10');
    expect(source).toContain('reason.length > 500');
    expect(source).toContain("status: 400");
  });

  it('bounds the driverId with isSafeOpaqueAdminId in suspend and reactivate routes', () => {
    const suspendSource = readFileSync(
      join(process.cwd(), 'app/api/admin/drivers/[driverId]/suspend/route.ts'),
      'utf8',
    );
    const reactivateSource = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/drivers/[driverId]/reactivate/route.ts',
      ),
      'utf8',
    );

    expect(suspendSource).toContain('isSafeOpaqueAdminId(driverId)');
    expect(reactivateSource).toContain('isSafeOpaqueAdminId(driverId)');
  });

  it('keeps the drivers list route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/drivers/route.ts'),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
    expect(source).toContain('createNoStoreAdminHeaders()');
  });

  it('bounds search and pageSize before proxying to the backend', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/drivers/route.ts'),
      'utf8',
    );

    expect(source).toContain('resolveStrictBoundedInteger');
    expect(source).not.toContain('parseInt');
    expect(source).toContain('100');
    expect(source).toContain('.slice(0, 120)');
  });

  it('keeps the reactivate route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/drivers/[driverId]/reactivate/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
    expect(source).toContain('createNoStoreAdminHeaders()');
    expect(source).toContain('isSafeAdminMutationRequest');
  });

  it('computes the Actifs/En attente summary tiles from verificationStatus, not the raw presence status', () => {
    // "status" est la presence en direct (OFFLINE/ONLINE/BUSY/SUSPENDED),
    // "verificationStatus" est le cycle de vie du dossier (PENDING/APPROVED/
    // REJECTED). Les deux etaient confondus ici — "Actifs"/"En attente"
    // cherchaient des valeurs de "status" qui n'existent jamais (ex: 'ACTIVE'),
    // affichant 0 en permanence quel que soit le nombre reel de chauffeurs
    // operationnels. Verifie que le calcul lit desormais le bon champ.
    const source = readFileSync(
      join(process.cwd(), 'app/drivers-board.tsx'),
      'utf8',
    );

    expect(source).toContain('d.verificationStatus === "APPROVED"');
    expect(source).toContain('d.status !== "SUSPENDED"');
    expect(source).toContain('d.verificationStatus === "PENDING"');
  });

  it('surfaces and repairs missing driver profiles for field-test triage', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/drivers-board.tsx'),
      'utf8',
    );

    expect(source).toContain('DRIVER_PROFILE_STATUS_LABELS');
    expect(source).toContain('Profil OK');
    expect(source).toContain('Profil manquant');
    expect(source).toContain('Profils manquants');
    expect(source).toContain('handleRepairProfile');
    expect(source).toContain('Reparer profil');
    expect(source).toContain('Derniere connexion:');
    expect(source).toContain('ID profil:');
  });

  it('protects driver profile repair mutations before proxying to the backend', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/drivers/[userId]/profile/repair/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('isSafeAdminMutationRequest');
    expect(source).toContain('isSafeOpaqueAdminId');
    expect(source).toContain('repairAdminDriverProfile');
    expect(source).toContain('Unable to repair driver profile.');
  });

  it('keeps the suspend route no-store and auth-guarded', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/drivers/[driverId]/suspend/route.ts'),
      'utf8',
    );

    expect(source).toContain('force-dynamic');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
    expect(source).toContain('createNoStoreAdminHeaders()');
    expect(source).toContain('isSafeAdminMutationRequest');
  });
});
