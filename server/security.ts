import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Passwords: scrypt with a random salt per password (memory-hard, built into Node, no native add-ons).
// Tokens (sessions, email links): 32 random bytes; only their SHA-256 is stored, so a database leak
// cannot be replayed as a login.

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, opts, (e, k) => (e ? rej(e) : res(k))));
const N = 16384, R = 8, P = 1, LEN = 64;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(pw.normalize('NFKC'), Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** A dummy hash to compare against when the email is unknown, so timing does not reveal who has an account. */
let dummy: string | undefined;
export async function burnPasswordCheck(pw: string) { dummy ??= await hashPassword('not-a-real-password'); await verifyPassword(pw, dummy); }

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Passwords: at least 8 characters, not all the same character, not an obvious one. */
const COMMON = new Set(['password', 'password1', '12345678', '123456789', '1234567890', 'qwertyuiop', 'iloveyou', 'keyholder', 'letmein1', 'abcdefgh', '11111111', 'password123']);
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(pw) || COMMON.has(pw.toLowerCase())) return 'That password is too easy to guess. Try a short sentence.';
  return null;
}

export const normEmail = (e: string) => e.trim().toLowerCase();
