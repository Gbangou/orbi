import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './auth-crypto';

describe('hashPassword / verifyPassword', () => {
  it('verifies the correct password against its stored hash', async () => {
    const hash = await hashPassword('MonMotDePasse123!');
    const valid = await verifyPassword('MonMotDePasse123!', hash);

    expect(valid).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('MonMotDePasse123!');
    const invalid = await verifyPassword('MauvaisMotDePasse', hash);

    expect(invalid).toBe(false);
  });

  it('produces a different hash each time due to random salt', async () => {
    const hash1 = await hashPassword('secret');
    const hash2 = await hashPassword('secret');

    expect(hash1).not.toBe(hash2);
  });

  it('stores the hash in salt:derivedKey format', async () => {
    const hash = await hashPassword('secret');
    const parts = hash.split(':');

    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(32);
    expect(parts[1]).toHaveLength(128);
  });

  it('returns false for a malformed stored hash with no separator', async () => {
    const invalid = await verifyPassword('password', 'not-a-valid-hash');

    expect(invalid).toBe(false);
  });
});

describe('generateSessionToken', () => {
  it('returns a non-empty base64url string', () => {
    const token = generateSessionToken();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique tokens on each call', () => {
    const tokens = new Set(
      Array.from({ length: 10 }, () => generateSessionToken()),
    );

    expect(tokens.size).toBe(10);
  });
});

describe('hashSessionToken', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = hashSessionToken('test-token');

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic — same input yields same hash', () => {
    const token = 'orbi-session-token-abc123';

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashSessionToken('token-a')).not.toBe(hashSessionToken('token-b'));
  });
});
