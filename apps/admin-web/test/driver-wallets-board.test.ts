/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('driver wallets board', () => {
  it('guards all financial mutations against duplicate in-flight requests', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/driver-wallets-board.tsx'),
      'utf8',
    );

    expect(source).toContain('mutationInFlightRef');
    expect(source).toContain('mutationInFlightRef.current.has(key)');
    expect(source).toContain('mutationInFlightRef.current.add(key)');
    expect(source).toContain('mutationInFlightRef.current.delete(key)');
  });

  it('scopes mutation keys per wallet to prevent cross-wallet collisions', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/driver-wallets-board.tsx'),
      'utf8',
    );

    expect(source).toContain('`prepare:${walletId}`');
    expect(source).toContain('`paid:${payoutId}`');
    expect(source).toContain('`recovery:${walletId}`');
  });

  it('generates server-side idempotency keys for recovery adjustments', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/driver-wallets-board.tsx'),
      'utf8',
    );

    expect(source).toContain('createAdminIdempotencyKey');
    expect(source).toContain("createAdminIdempotencyKey('recovery')");
  });

  it('validates the idempotency key format before forwarding to backend', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-wallets/[walletId]/recovery-adjustments/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('isSafeIdempotencyKey');
    expect(source).toContain('createAdminIdempotencyKey');
  });

  it('validates recovery amount is a positive finite number before proxying', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-wallets/[walletId]/recovery-adjustments/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('isSafePositiveAmount');
    expect(source).toContain('Number.isFinite(value)');
    expect(source).toContain('value > 0');
  });

  it('bounds wallet and payout identifiers with isSafeOpaqueAdminId in both routes', () => {
    const prepareSource = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-wallets/[walletId]/payouts/prepare/route.ts',
      ),
      'utf8',
    );
    const recoverySource = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-wallets/[walletId]/recovery-adjustments/route.ts',
      ),
      'utf8',
    );
    const paidSource = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-payouts/[payoutId]/paid/route.ts',
      ),
      'utf8',
    );

    expect(prepareSource).toContain('isSafeOpaqueAdminId');
    expect(recoverySource).toContain('isSafeOpaqueAdminId');
    expect(paidSource).toContain('isSafeOpaqueAdminId(payoutId)');
  });

  it('keeps payouts prepare route responses no-store and auth-guarded', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-wallets/[walletId]/payouts/prepare/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('createNoStoreAdminHeaders()');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
  });

  it('keeps mark-paid route responses no-store and mutation-guarded', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-payouts/[payoutId]/paid/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('isSafeAdminMutationRequest');
    expect(source).toContain('createNoStoreAdminHeaders()');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
  });
});
