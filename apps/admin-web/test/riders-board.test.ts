/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('riders board', () => {
  it('guards rider status changes against duplicate clicks', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/riders-board.tsx'),
      'utf8',
    );

    expect(source).toContain('riderStatusInFlightRef');
    expect(source).toContain('riderStatusInFlightRef.current.has(userId)');
    expect(source).toContain('riderStatusInFlightRef.current.add(userId)');
    expect(source).toContain('riderStatusInFlightRef.current.delete(userId)');
  });

  it('surfaces rider profile health for field-test triage', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/riders-board.tsx'),
      'utf8',
    );

    expect(source).toContain('RIDER_PROFILE_STATUS_LABELS');
    expect(source).toContain('Profil OK');
    expect(source).toContain('Profil manquant');
    expect(source).toContain('Profils manquants');
    expect(source).toContain('Derniere connexion:');
    expect(source).toContain('ID profil:');
    expect(source).toContain('handleRepairProfile');
    expect(source).toContain('Reparer profil');
  });

  it('bounds riders list pagination and search before proxying to the backend', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/riders/route.ts'),
      'utf8',
    );

    expect(source).toContain('resolveStrictBoundedInteger');
    expect(source).not.toContain('parseInt');
    expect(source).toContain('100');
    expect(source).toContain('.slice(0, 120)');
  });

  it('protects rider profile repair mutations before proxying to the backend', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/admin/riders/[userId]/profile/repair/route.ts'),
      'utf8',
    );

    expect(source).toContain('isSafeAdminMutationRequest');
    expect(source).toContain('isSafeOpaqueAdminId');
    expect(source).toContain('repairAdminRiderProfile');
    expect(source).toContain('Unable to repair rider profile.');
  });
});
