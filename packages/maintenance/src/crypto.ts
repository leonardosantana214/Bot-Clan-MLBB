import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Encrypted backup layout (all offsets in bytes):
 *   0  magic "AEROBK"  (6)
 *   6  format version  (1)  = 1
 *   7  log2(scrypt N)  (1)
 *   8  salt            (16)
 *   24 iv              (12)
 *   36 GCM auth tag    (16)
 *   52 ciphertext      (rest)
 * The first 36 bytes (magic..iv) are authenticated as AAD, so header tampering is detected.
 */
export const MAGIC = Buffer.from('AEROBK', 'ascii');
export const FORMAT_VERSION = 1;
const SALT = 16, IV = 12, HEADER = 52, LOG2N = 15, MIN_LOG2N = 14, MAX_LOG2N = 20;
export const MIN_PASSPHRASE_LENGTH = 12;

export class BackupCryptoError extends Error {
  constructor(readonly code: 'not-encrypted' | 'unsupported-version' | 'truncated' | 'wrong-key-or-tampered' | 'passphrase-required' | 'weak-passphrase', message: string) {
    super(message); this.name = 'BackupCryptoError';
  }
}

export const DEFAULT_PASSPHRASE_ENV = 'AEROBOT_BACKUP_PASSPHRASE';
/** Reads the passphrase from the environment. Returns undefined when unset/empty. Never logs it. */
export function passphraseFromEnv(env: NodeJS.ProcessEnv = process.env, name = DEFAULT_PASSPHRASE_ENV): string | undefined {
  const value = env[name];
  return value ? value : undefined;
}

function assertStrong(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new BackupCryptoError('weak-passphrase', `Passphrase must have at least ${MIN_PASSPHRASE_LENGTH} characters.`);
}
function deriveKey(passphrase: string, salt: Buffer, log2n: number): Buffer {
  return scryptSync(passphrase.normalize('NFKC'), salt, 32, { N: 2 ** log2n, r: 8, p: 1, maxmem: 256 * 2 ** 20 });
}

export function isEncryptedBackup(data: Buffer): boolean {
  return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encryptBuffer(plain: Buffer, passphrase: string): Buffer {
  assertStrong(passphrase);
  const salt = randomBytes(SALT), iv = randomBytes(IV);
  const head = Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION, LOG2N]), salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt, LOG2N), iv);
  cipher.setAAD(head);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([head, cipher.getAuthTag(), body]);
}

export function decryptBuffer(data: Buffer, passphrase: string | undefined): Buffer {
  if (!isEncryptedBackup(data)) throw new BackupCryptoError('not-encrypted', 'File is not an encrypted AeroBot backup.');
  if (data.length < HEADER) throw new BackupCryptoError('truncated', 'Encrypted backup is truncated.');
  if (data[6] !== FORMAT_VERSION) throw new BackupCryptoError('unsupported-version', `Unsupported encrypted backup version ${data[6]}.`);
  if (!passphrase) throw new BackupCryptoError('passphrase-required', 'This backup is encrypted; a passphrase is required.');
  const log2n = data[7]!;
  if (log2n < MIN_LOG2N || log2n > MAX_LOG2N) throw new BackupCryptoError('wrong-key-or-tampered', 'Invalid key-derivation parameters (file tampered).');
  const head = data.subarray(0, 36), salt = data.subarray(8, 8 + SALT), iv = data.subarray(24, 24 + IV), tag = data.subarray(36, HEADER);
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt, log2n), iv);
    decipher.setAAD(head); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(HEADER)), decipher.final()]);
  } catch {
    throw new BackupCryptoError('wrong-key-or-tampered', 'Wrong passphrase or the backup file was modified/corrupted.');
  }
}
