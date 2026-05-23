import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './auth-crypto';

/**
 * OWASP ASVS 2.4 / NIST SP 800-63B — Credential storage and session token
 * security invariants.
 *
 * 1. Password hashing uses scrypt with a unique random salt per credential.
 *    Two identical passwords must produce distinct hashes.
 * 2. verifyPassword correctly accepts the correct password and rejects wrong
 *    ones — including timing-safe edge cases (prefix, suffix, empty string).
 * 3. A malformed storedHash (no salt separator) returns false without throwing.
 * 4. generateSessionToken returns a high-entropy opaque token (≥ 32 bytes of
 *    entropy, URL-safe base64, no two calls produce the same value).
 * 5. hashSessionToken is deterministic (same input → same SHA-256 hex digest)
 *    and does not store the raw token (the hash does not contain the token).
 * 6. Session token hashes are distinct from password hashes (different shape).
 */
describe('auth-crypto — credential security invariants', () => {
  // ── Password hashing ───────────────────────────────────────────────────────

  describe('hashPassword / verifyPassword', () => {
    it('produces a salt:derivedKey format with two components', async () => {
      const hash = await hashPassword('Orbi123!');
      const parts = hash.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
      expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    });

    it('uses a unique salt per call — two identical passwords hash differently', async () => {
      const hash1 = await hashPassword('SamePassword1!');
      const hash2 = await hashPassword('SamePassword1!');
      expect(hash1).not.toBe(hash2);
    });

    it('verifies the correct password against its hash', async () => {
      const hash = await hashPassword('CorrectHorse!99');
      expect(await verifyPassword('CorrectHorse!99', hash)).toBe(true);
    });

    it('rejects a wrong password (same hash)', async () => {
      const hash = await hashPassword('Orbi123!');
      expect(await verifyPassword('wrong-password', hash)).toBe(false);
    });

    it('rejects an empty string password', async () => {
      const hash = await hashPassword('Orbi123!');
      expect(await verifyPassword('', hash)).toBe(false);
    });

    it('rejects a password that is a prefix of the correct one', async () => {
      const hash = await hashPassword('Orbi123!Extra');
      expect(await verifyPassword('Orbi123!', hash)).toBe(false);
    });

    it('rejects a password with trailing characters (padded)', async () => {
      const hash = await hashPassword('Orbi123!');
      expect(await verifyPassword('Orbi123!Extra', hash)).toBe(false);
    });

    it('returns false for a malformed storedHash without a salt separator', async () => {
      expect(await verifyPassword('anything', 'no-colon-in-this-hash')).toBe(false);
    });

    it('returns false for an empty storedHash', async () => {
      expect(await verifyPassword('anything', '')).toBe(false);
    });
  });

  // ── Session token generation ───────────────────────────────────────────────

  describe('generateSessionToken', () => {
    it('generates a URL-safe base64 string with at least 64 characters', () => {
      const token = generateSessionToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // 48 bytes of randomBytes base64url → ≥64 chars (entropy ≥ 384 bits)
      expect(token.length).toBeGreaterThanOrEqual(64);
    });

    it('generates a different token on every call (no two calls the same)', () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateSessionToken()));
      expect(tokens.size).toBe(10);
    });

    it('token does not contain sensitive patterns (no newlines, spaces, or quotes)', () => {
      for (let i = 0; i < 20; i++) {
        const token = generateSessionToken();
        expect(token).not.toMatch(/[\s"'<>]/);
      }
    });
  });

  // ── Session token hashing ──────────────────────────────────────────────────

  describe('hashSessionToken', () => {
    it('produces a deterministic SHA-256 hex digest', () => {
      const token = 'test-session-token';
      expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    });

    it('produces a 64-character hex string (SHA-256)', () => {
      const hash = hashSessionToken(generateSessionToken());
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces a different hash for different tokens', () => {
      const t1 = generateSessionToken();
      const t2 = generateSessionToken();
      expect(hashSessionToken(t1)).not.toBe(hashSessionToken(t2));
    });

    it('hash does not contain the raw token (one-way)', () => {
      const token = generateSessionToken();
      const hash = hashSessionToken(token);
      expect(hash).not.toContain(token);
    });

    it('hash shape differs from a password hash (no salt: prefix)', () => {
      const sessionHash = hashSessionToken('some-token');
      expect(sessionHash).not.toContain(':');
    });
  });

  // ── Cross-function isolation ───────────────────────────────────────────────

  describe('session token hashes and password hashes are never interchangeable', () => {
    it('a session token hash cannot satisfy verifyPassword', async () => {
      const token = generateSessionToken();
      const sessionHash = hashSessionToken(token);
      expect(await verifyPassword(token, sessionHash)).toBe(false);
    });

    it('a password hash is not a valid session token hash format', async () => {
      const passwordHash = await hashPassword('Orbi123!');
      // Password hashes contain `:` while session hashes are pure hex
      expect(passwordHash).toContain(':');
      expect(passwordHash).not.toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
