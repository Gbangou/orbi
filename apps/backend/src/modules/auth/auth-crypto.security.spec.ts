import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './auth-crypto';

/**
 * OWASP ASVS 2.4 / NIST SP 800-63B — Invariants de sécurité sur le stockage
 * des credentials et la gestion des tokens de session.
 *
 * 1. Le hachage de mot de passe utilise scrypt avec un sel aléatoire unique par
 *    credential. Deux mots de passe identiques doivent produire des hachages distincts.
 * 2. verifyPassword accepte le bon mot de passe et rejette les mauvais,
 *    y compris les cas limites résistants au timing (préfixe, suffixe, chaîne vide).
 * 3. Un storedHash malformé (sans séparateur de sel) retourne false sans lever d'exception.
 * 4. generateSessionToken retourne un token opaque à haute entropie (≥ 32 octets
 *    d'entropie, base64 URL-safe, deux appels ne produisent jamais la même valeur).
 * 5. hashSessionToken est déterministe (même entrée → même digest SHA-256 hex)
 *    et ne stocke pas le token brut (le hash ne contient pas le token).
 * 6. Les hachages de tokens de session sont distincts des hachages de mots de passe.
 */
describe('auth-crypto — credential security invariants', () => {
  // ── Hachage de mots de passe ──────────────────────────────────────────────

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
      expect(await verifyPassword('anything', 'no-colon-in-this-hash')).toBe(
        false,
      );
    });

    it('returns false for an empty storedHash', async () => {
      expect(await verifyPassword('anything', '')).toBe(false);
    });
  });

  // ── Génération des tokens de session ──────────────────────────────────────

  describe('generateSessionToken', () => {
    it('generates a URL-safe base64 string with at least 64 characters', () => {
      const token = generateSessionToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // 48 octets de randomBytes base64url → ≥64 caractères (entropie ≥ 384 bits)
      expect(token.length).toBeGreaterThanOrEqual(64);
    });

    it('generates a different token on every call (no two calls the same)', () => {
      const tokens = new Set(
        Array.from({ length: 10 }, () => generateSessionToken()),
      );
      expect(tokens.size).toBe(10);
    });

    it('token does not contain sensitive patterns (no newlines, spaces, or quotes)', () => {
      for (let i = 0; i < 20; i++) {
        const token = generateSessionToken();
        expect(token).not.toMatch(/[\s"'<>]/);
      }
    });
  });

  // ── Hachage des tokens de session ─────────────────────────────────────────

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

  // ── Isolation inter-fonctions ─────────────────────────────────────────────

  describe('session token hashes and password hashes are never interchangeable', () => {
    it('a session token hash cannot satisfy verifyPassword', async () => {
      const token = generateSessionToken();
      const sessionHash = hashSessionToken(token);
      expect(await verifyPassword(token, sessionHash)).toBe(false);
    });

    it('a password hash is not a valid session token hash format', async () => {
      const passwordHash = await hashPassword('Orbi123!');
      // Les hachages de mots de passe contiennent `:` ; les hachages de session sont du hex pur
      expect(passwordHash).toContain(':');
      expect(passwordHash).not.toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
