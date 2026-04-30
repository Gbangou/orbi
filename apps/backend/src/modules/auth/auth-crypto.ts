import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const HASH_KEY_LENGTH = 64;

// Password hashes are stored as `salt:derivedKey` so we can rotate hashing
// parameters later without changing the public service contract.
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, HASH_KEY_LENGTH)) as Buffer;

  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(':');

  if (!salt || !key) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, HASH_KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(key, 'hex');

  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derivedKey);
}

// Session tokens are opaque credentials: the raw token is only returned once to
// the client, while the database stores a one-way hash for later verification.
export function generateSessionToken() {
  return randomBytes(48).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
