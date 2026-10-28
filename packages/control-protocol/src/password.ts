import { randomBytes, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from 'node:crypto';

export interface ScryptParams { N: number; r: number; p: number; keyLength: number; saltLength: number }
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 32768, r: 8, p: 1, keyLength: 32, saltLength: 16 };
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 1024;
const PREFIX = 'scrypt$v=1$';

function derive(password: BinaryLike, salt: Buffer, keyLength: number, o: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, keyLength, o, (e, k) => (e ? reject(e) : resolve(k))));
}
const opts = (N: number, r: number, p: number): ScryptOptions => ({ N, r, p, maxmem: 128 * N * r * 2 + 128 * r * p + (1 << 20) });
function validParams(N: number, r: number, p: number, keyLength: number, saltLength: number): boolean {
  return Number.isInteger(N) && N >= 1024 && N <= 1 << 20 && (N & (N - 1)) === 0 &&
    Number.isInteger(r) && r >= 1 && r <= 32 && Number.isInteger(p) && p >= 1 && p <= 16 &&
    keyLength >= 16 && keyLength <= 128 && saltLength >= 8 && saltLength <= 64;
}

/** Produces a self-describing hash: scrypt$v=1$N=..,r=..,p=..$<salt b64url>$<key b64url>. Never stores the password. */
export async function hashPassword(password: string, params: Partial<ScryptParams> = {}): Promise<string> {
  const { N, r, p, keyLength, saltLength } = { ...DEFAULT_SCRYPT_PARAMS, ...params };
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) throw new Error(`password must have ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`);
  if (!validParams(N, r, p, keyLength, saltLength)) throw new Error('invalid scrypt parameters');
  const salt = randomBytes(saltLength);
  const key = await derive(password.normalize('NFKC'), salt, keyLength, opts(N, r, p));
  return `${PREFIX}N=${N},r=${r},p=${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

interface Parsed { N: number; r: number; p: number; salt: Buffer; key: Buffer }
export function parsePasswordHash(encoded: string): Parsed | undefined {
  if (!encoded.startsWith(PREFIX)) return undefined;
  const parts = encoded.slice(PREFIX.length).split('$');
  if (parts.length !== 3) return undefined;
  const m = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[0] ?? '');
  if (!m) return undefined;
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  const salt = Buffer.from(parts[1] ?? '', 'base64url'); const key = Buffer.from(parts[2] ?? '', 'base64url');
  if (!validParams(N, r, p, key.length, salt.length)) return undefined;
  return { N, r, p, salt, key };
}
export function isValidPasswordHash(encoded: string): boolean { return parsePasswordHash(encoded) !== undefined; }

/** Constant-time verification. Returns false (never throws) on malformed input. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parsePasswordHash(encoded);
  if (!parsed || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return false;
  try {
    const key = await derive(password.normalize('NFKC'), parsed.salt, parsed.key.length, opts(parsed.N, parsed.r, parsed.p));
    return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
  } catch { return false; }
}
