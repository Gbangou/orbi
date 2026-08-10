import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const HASH_KEY_LENGTH = 64;

// Les hachages de mots de passe sont stockés au format `sel:cléDérivée` pour
// permettre la rotation des paramètres de hachage sans changer le contrat public.
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

// Les tokens de session sont des credentials opaques : le token brut n'est retourné
// qu'une seule fois au client ; la base de données stocke un hash unidirectionnel.
export function generateSessionToken() {
  return randomBytes(48).toString('base64url');
}

export function generateRefreshToken() {
  return randomBytes(64).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// Code OTP à 6 chiffres généré via un CSPRNG (pas Math.random) pour éviter
// tout biais prévisible sur un secret à faible entropie.
export function generateOtpCode() {
  return (randomBytes(4).readUInt32BE(0) % 1_000_000)
    .toString()
    .padStart(6, '0');
}

export function hashOtpCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function verifyOtpCode(code: string, storedHash: string) {
  const candidateHash = Buffer.from(hashOtpCode(code));
  const expectedHash = Buffer.from(storedHash);

  if (candidateHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(candidateHash, expectedHash);
}
