import { BadRequestException } from '@nestjs/common';
import { OpaqueIdPipe } from './opaque-id.pipe';

/**
 * OWASP API1 (BOLA) + WSTG-INPV-01 (Path Traversal) + WSTG-INPV-02 (Stored
 * XSS via identifiers) — OpaqueIdPipe guards every URL route parameter.
 *
 * The allowlist pattern /^[A-Za-z0-9][A-Za-z0-9_-]{2,96}$/ ensures that
 * only URL-safe opaque identifiers can reach service methods, preventing
 * path traversal, SQL injection fragments, and injected script tags from
 * being forwarded as entity identifiers.
 */
describe('OpaqueIdPipe', () => {
  // ── Accepted identifiers ──────────────────────────────────────────────────

  it.each([
    'clv1234567890abcdef',
    'job-dead-1',
    'rider-abc-123',
    'trip_xyz',
    'evt-1',
    'abc',
    'A1b',
    'a'.repeat(97),
  ])('accepts a safe opaque identifier: %s', (value) => {
    const pipe = new OpaqueIdPipe('id');
    expect(pipe.transform(value)).toBe(value);
  });

  // ── Path traversal ────────────────────────────────────────────────────────

  it.each([
    '../driver-1',
    '..\\driver-1',
    '../../etc/passwd',
    '..%2Fdriver-1',
    '..',
    '.',
    './admin',
  ])('rejects path traversal sequence: %s', (value) => {
    const pipe = new OpaqueIdPipe('driverId');
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });

  // ── Injection payloads ────────────────────────────────────────────────────

  it.each([
    "<script>alert('xss')</script>",
    '<img src=x onerror=alert(1)>',
    "' OR 1=1 --",
    '; DROP TABLE users; --',
    '${7*7}',
    '{{7*7}}',
    'id\ninjected-header: value',
  ])('rejects injection payload: %s', (value) => {
    const pipe = new OpaqueIdPipe('tripId');
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });

  // ── Length bounds ─────────────────────────────────────────────────────────

  it('rejects an identifier that is too short (< 3 chars)', () => {
    const pipe = new OpaqueIdPipe('id');
    expect(() => pipe.transform('ab')).toThrow(BadRequestException);
  });

  it('rejects an empty string', () => {
    const pipe = new OpaqueIdPipe('id');
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('rejects an identifier that exceeds 97 characters', () => {
    const pipe = new OpaqueIdPipe('id');
    expect(() => pipe.transform('a'.repeat(98))).toThrow(BadRequestException);
  });

  it('accepts an identifier at the maximum allowed length (97 chars)', () => {
    const pipe = new OpaqueIdPipe('id');
    const maxId = 'a'.repeat(97);
    expect(pipe.transform(maxId)).toBe(maxId);
  });

  // ── Type safety ───────────────────────────────────────────────────────────

  it('rejects a non-string value (number)', () => {
    const pipe = new OpaqueIdPipe('id');
    expect(() => pipe.transform(12345 as unknown as string)).toThrow(BadRequestException);
  });

  it('rejects null', () => {
    const pipe = new OpaqueIdPipe('id');
    expect(() => pipe.transform(null as unknown as string)).toThrow(BadRequestException);
  });

  it('rejects undefined', () => {
    const pipe = new OpaqueIdPipe('id');
    expect(() => pipe.transform(undefined as unknown as string)).toThrow(BadRequestException);
  });

  // ── Error message includes the label ─────────────────────────────────────

  it('includes the label in the error message', () => {
    const pipe = new OpaqueIdPipe('walletId');
    let message = '';
    try {
      pipe.transform('../evil');
    } catch (e: unknown) {
      message = (e as BadRequestException).message;
    }
    expect(message).toContain('walletId');
  });
});
