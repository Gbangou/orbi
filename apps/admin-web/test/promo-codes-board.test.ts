/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizePromoCodeDate,
  normalizePromoCodePayload,
} from '../app/api/admin/promo-codes/route';
import { resolvePromoCodeFormPayload } from '../app/promo-code-safety';

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

    expect(source).toContain('resolvePromoCodeFormPayload');
    expect(source).not.toContain('Number(form.discountBps)');
    expect(source).not.toContain('Date.parse(form.validFrom)');
  });

  it('builds strict promo payloads from valid board form values', () => {
    expect(
      resolvePromoCodeFormPayload({
        code: ' bienvenue20 ',
        description: ' Campagne ',
        discountBps: '2000',
        maxUses: '100',
        validFrom: '2026-07-15',
        validTo: '2026-07-31',
        firstTripOnly: true,
      }),
    ).toEqual({
      payload: {
        code: 'BIENVENUE20',
        description: 'Campagne',
        discountBps: 2000,
        maxUses: 100,
        validFrom: '2026-07-15T00:00:00.000Z',
        validTo: '2026-07-31T00:00:00.000Z',
        firstTripOnly: true,
      },
      error: null,
    });
  });

  it('rejects dirty promo numbers and invalid calendar dates before network calls', () => {
    expect(
      resolvePromoCodeFormPayload({
        code: 'WELCOME',
        description: '',
        discountBps: '2000abc',
        maxUses: '',
        validFrom: '2026-07-15',
        validTo: '2026-07-31',
        firstTripOnly: true,
      }).payload,
    ).toBeNull();

    expect(
      resolvePromoCodeFormPayload({
        code: 'WELCOME',
        description: '',
        discountBps: '2000',
        maxUses: '1e2',
        validFrom: '2026-07-15',
        validTo: '2026-07-31',
        firstTripOnly: true,
      }).payload,
    ).toBeNull();

    expect(
      resolvePromoCodeFormPayload({
        code: 'WELCOME',
        description: '',
        discountBps: '2000',
        maxUses: '',
        validFrom: '2026-02-31',
        validTo: '2026-07-31',
        firstTripOnly: true,
      }).payload,
    ).toBeNull();
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

  it('validates promo dates as strict real UTC instants in the route handler', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/admin/promo-codes/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('normalizePromoCodeDate');
    expect(routeSource).toContain('isoUtcDateTimePattern');
    expect(routeSource).not.toContain('Date.parse(validFrom)');
    expect(routeSource).not.toContain('Date.parse(validTo)');

    expect(normalizePromoCodeDate('2026-07-15T00:00:00.000Z')).toBe(
      '2026-07-15T00:00:00.000Z',
    );
    expect(normalizePromoCodeDate('2026-07-15T08:30:15Z')).toBe(
      '2026-07-15T08:30:15.000Z',
    );
    expect(normalizePromoCodeDate('2026-02-31T00:00:00.000Z')).toBeNull();
    expect(normalizePromoCodeDate('2026-07-15')).toBeNull();
    expect(normalizePromoCodeDate('not-a-date')).toBeNull();
  });

  it('rejects promo windows where validTo is not after validFrom', () => {
    expect(
      normalizePromoCodePayload({
        code: 'WELCOME',
        discountBps: 2000,
        validFrom: '2026-07-31T00:00:00.000Z',
        validTo: '2026-07-15T00:00:00.000Z',
      }),
    ).toBeNull();
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
