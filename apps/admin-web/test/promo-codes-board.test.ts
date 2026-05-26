/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('promo codes board', () => {
  it('guards promo creation and deactivation against duplicate submits', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/promo-codes-board.tsx'),
      'utf8',
    );

    expect(source).toContain('promoCreateInFlightRef');
    expect(source).toContain('promoCreateInFlightRef.current = true');
    expect(source).toContain('promoCreateInFlightRef.current = false');
    expect(source).toContain('promoDeactivateInFlightRef');
    expect(source).toContain('promoDeactivateInFlightRef.current.has(id)');
    expect(source).toContain('promoDeactivateInFlightRef.current.add(id)');
    expect(source).toContain('promoDeactivateInFlightRef.current.delete(id)');
  });

  it('sends the mutation guard header on promo creation and deactivation', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/promo-codes-board.tsx'),
      'utf8',
    );

    expect(source).toContain('createAdminMutationHeaders');
  });

  it('validates promo creation bounds before submitting from the board', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/promo-codes-board.tsx'),
      'utf8',
    );

    expect(source).toContain('Number.isInteger(discountBps)');
    expect(source).toContain('discountBps > 10000');
    expect(source).toContain('Number.isInteger(maxUses)');
    expect(source).toContain('maxUses > 100000');
    expect(source).toContain('validToMs <= validFromMs');
  });

  it('validates discount bps is a positive integer within bounds before submitting', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('normalizePromoCodePayload');
    expect(routeSource).toContain('discountBps < 1');
    expect(routeSource).toContain('discountBps > 10000');
    expect(routeSource).toContain('Number.isInteger(input.discountBps)');
  });

  it('rejects codes shorter than 3 or longer than 32 characters in the route handler', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('code.length < 3');
    expect(routeSource).toContain('code.length > 32');
  });

  it('validates validFrom and validTo are parseable date strings', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('Date.parse(validFrom)');
    expect(routeSource).toContain('Date.parse(validTo)');
    expect(routeSource).toContain('Number.isNaN');
  });

  it('rejects promo windows where validTo is not after validFrom', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('validToMs <= validFromMs');
  });

  it('keeps the promo-codes list route no-store and auth-guarded', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('force-dynamic');
    expect(routeSource).toContain('getAdminServerAuthClient');
    expect(routeSource).toContain('createAdminServerAuthErrorResponse');
    expect(routeSource).toContain('createNoStoreAdminHeaders()');
  });

  it('guards the promo creation POST route with the admin mutation guard', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('isSafeAdminMutationRequest');
  });

  it('bounds the promo code id with isSafeOpaqueAdminId in the DELETE route', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/[promoCodeId]/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('isSafeOpaqueAdminId(promoCodeId)');
    expect(routeSource).toContain('isSafeAdminMutationRequest');
    expect(routeSource).toContain('force-dynamic');
  });
});
