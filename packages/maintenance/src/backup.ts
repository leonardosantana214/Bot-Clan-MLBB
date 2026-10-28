import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { Clock } from '@aerobot/core';
import { decryptBuffer, encryptBuffer, isEncryptedBackup } from './crypto.js';

export const KNOWN_TABLES = ['schema_version', 'member', 'whatsapp_identity', 'group_route', 'xp_transaction', 'xp_balance', 'seen_message', 'audit_log'] as const;
export const MANIFEST_FORMAT = 'aerobot-backup-manifest';
export const CREATED_BY = 'aerobot-maintenance';
const NAME_RE = /^aerobot-backup-(\d{8}T\d{9}Z)-([0-9a-f]{8})\.sqlite(\.enc)?$/;
const MANIFEST_SUFFIX = '.manifest.json';

export const systemClock: Clock = { now: () => Date.now() };
export const defaultBackupDir = (): string => join(homedir(), '.aerobot', 'backups');

export class BackupError extends Error {
  constructor(readonly code: 'invalid-manifest' | 'hash-mismatch' | 'integrity-failed' | 'count-mismatch' | 'schema-mismatch' | 'destination-exists' | 'missing-file' | 'source-invalid', message: string) {
    super(message); this.name = 'BackupError';
  }
}

export const manifestSchema = z.object({
  format: z.literal(MANIFEST_FORMAT),
  version: z.literal(1),
  createdBy: z.literal(CREATED_BY),
  createdAt: z.number().int().nonnegative(),
  file: z.string().regex(NAME_RE),
  encrypted: z.boolean(),
  sizeBytes: z.number().int().nonnegative(),
  /** SHA-256 of the stored file (ciphertext when encrypted). */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** SHA-256 of the plain SQLite copy. */
  sha256Plain: z.string().regex(/^[0-9a-f]{64}$/),
  schemaVersion: z.number().int().nonnegative(),
  tables: z.record(z.string(), z.number().int().nonnegative())
}).strict();
export type BackupManifest = z.infer<typeof manifestSchema>;

export interface BackupOptions {
  dbPath: string;
  backupDir?: string;
  clock?: Clock;
  /** When set, the backup is encrypted with AES-256-GCM (key derived by scrypt). Never stored or logged. */
  passphrase?: string | undefined;
  rotation?: RotationPolicy | false;
  /** Receives non-sensitive messages only (no paths, no secrets). */
  log?: (message: string) => void;
}
export interface BackupResult { manifest: BackupManifest; file: string; manifestFile: string; deleted: readonly string[] }

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
/** Sortable, filename-safe UTC timestamp: YYYYMMDDTHHMMSSmmmZ. */
const stamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace('.', '');

async function atomicWriteFile(path: string, data: Buffer | string): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, data, { flag: 'wx', mode: 0o600 }); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}

/** Integrity check + row counts + schema version of a plain SQLite file, opened read-only. */
export function inspectDatabase(path: string): { schemaVersion: number; tables: Record<string, number> } {
  let db: DatabaseSync;
  try { db = new DatabaseSync(path, { readOnly: true }); } catch { throw new BackupError('integrity-failed', 'Database cannot be opened.'); }
  try {
    let check: string[];
    try { check = db.prepare('PRAGMA integrity_check').all().map(row => String(Object.values(row)[0])); }
    catch { throw new BackupError('integrity-failed', 'PRAGMA integrity_check could not run.'); }
    if (check.length !== 1 || check[0] !== 'ok') throw new BackupError('integrity-failed', 'PRAGMA integrity_check failed.');
    const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => String(row.name)));
    if (!present.has('schema_version')) throw new BackupError('source-invalid', 'Not an AeroBot database (schema_version missing).');
    const tables: Record<string, number> = {};
    for (const table of KNOWN_TABLES) if (present.has(table)) tables[table] = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
    const schemaVersion = Number(db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get()!.v);
    return { schemaVersion, tables };
  } finally { db.close(); }
}

export async function createBackup(options: BackupOptions): Promise<BackupResult> {
  const clock = options.clock ?? systemClock;
  const dir = resolve(options.backupDir ?? defaultBackupDir());
  const log = options.log ?? (() => undefined);
  if (!existsSync(options.dbPath)) throw new BackupError('source-invalid', 'Source database does not exist.');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tempPlain = join(dir, `.tmp-${randomUUID()}.sqlite`);
  const createdAt = clock.now();
  try {
    const source = new DatabaseSync(options.dbPath);
    try {
      source.exec('PRAGMA busy_timeout = 10000');
      // VACUUM INTO runs inside one read transaction: a consistent snapshot even with WAL writers.
      source.exec(`VACUUM INTO ${sqlString(tempPlain)}`);
    } finally { source.close(); }
    const { schemaVersion, tables } = inspectDatabase(tempPlain);
    const plain = await readFile(tempPlain);
    const stored = options.passphrase ? encryptBuffer(plain, options.passphrase) : plain;
    const file = `aerobot-backup-${stamp(createdAt)}-${sha256(stored).slice(0, 8)}.sqlite${options.passphrase ? '.enc' : ''}`;
    const manifest: BackupManifest = {
      format: MANIFEST_FORMAT, version: 1, createdBy: CREATED_BY, createdAt, file, encrypted: Boolean(options.passphrase),
      sizeBytes: stored.length, sha256: sha256(stored), sha256Plain: sha256(plain), schemaVersion, tables
    };
    const target = join(dir, file);
    await atomicWriteFile(target, stored);
    // Re-read what hit the disk: the backup only counts if the stored bytes match.
    if (sha256(await readFile(target)) !== manifest.sha256) { await rm(target, { force: true }); throw new BackupError('hash-mismatch', 'Backup verification failed after writing.'); }
    const manifestFile = target + MANIFEST_SUFFIX;
    await atomicWriteFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n'); // manifest = commit marker
    log(`backup created (${manifest.encrypted ? 'encrypted' : 'plain'}, ${manifest.sizeBytes} bytes, sha256 ${manifest.sha256.slice(0, 8)})`);
    const deleted = options.rotation === false ? [] : await rotateBackups({ backupDir: dir, policy: options.rotation ?? {}, log });
    return { manifest, file: target, manifestFile, deleted };
  } finally { await rm(tempPlain, { force: true }); }
}

/** Reads a stored backup, checks the manifest and hashes, and returns the plain SQLite bytes. */
export async function readVerifiedBackup(backupFile: string, passphrase?: string): Promise<{ manifest: BackupManifest; plain: Buffer }> {
  const file = backupFile.endsWith(MANIFEST_SUFFIX) ? backupFile.slice(0, -MANIFEST_SUFFIX.length) : backupFile;
  if (!existsSync(file) || !existsSync(file + MANIFEST_SUFFIX)) throw new BackupError('missing-file', 'Backup file or its manifest is missing.');
  let manifest: BackupManifest;
  try { manifest = manifestSchema.parse(JSON.parse(await readFile(file + MANIFEST_SUFFIX, 'utf8'))); }
  catch { throw new BackupError('invalid-manifest', 'Backup manifest is invalid.'); }
  if (manifest.file !== basename(file)) throw new BackupError('invalid-manifest', 'Manifest does not match the backup file name.');
  const stored = await readFile(file);
  if (stored.length !== manifest.sizeBytes || sha256(stored) !== manifest.sha256) throw new BackupError('hash-mismatch', 'Backup file does not match the manifest hash (corrupted or modified).');
  if (manifest.encrypted !== isEncryptedBackup(stored)) throw new BackupError('invalid-manifest', 'Manifest encryption flag does not match the file.');
  const plain = manifest.encrypted ? decryptBuffer(stored, passphrase) : stored;
  if (sha256(plain) !== manifest.sha256Plain) throw new BackupError('hash-mismatch', 'Decrypted content does not match the manifest.');
  return { manifest, plain };
}

function verifyPlainAgainstManifest(path: string, manifest: BackupManifest): void {
  const actual = inspectDatabase(path);
  if (actual.schemaVersion !== manifest.schemaVersion) throw new BackupError('schema-mismatch', 'Schema version differs from the manifest.');
  for (const [table, count] of Object.entries(manifest.tables)) if (actual.tables[table] !== count) throw new BackupError('count-mismatch', `Row count mismatch in ${table}.`);
}

/** Full verification (manifest, hashes, decryption, integrity_check, counts) without touching any live database. */
export async function verifyBackup(backupFile: string, passphrase?: string): Promise<BackupManifest> {
  const { manifest, plain } = await readVerifiedBackup(backupFile, passphrase);
  const temp = join(dirname(resolve(backupFile)), `.verify-${randomUUID()}.sqlite`);
  try { await writeFile(temp, plain, { flag: 'wx', mode: 0o600 }); verifyPlainAgainstManifest(temp, manifest); }
  finally { await rm(temp, { force: true }); }
  return manifest;
}

export interface RestoreOptions {
  backupFile: string;
  destination: string;
  passphrase?: string | undefined;
  /** Explicit opt-in: an existing destination is renamed to <dest>.bak-<timestamp> (never overwritten). */
  keepExistingAsBak?: boolean;
  clock?: Clock;
}
export interface RestoreResult { manifest: BackupManifest; destination: string; previousMovedTo?: string }

/** Validates everything first; the live database is never overwritten in place. */
export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  const clock = options.clock ?? systemClock;
  const destination = resolve(options.destination);
  const { manifest, plain } = await readVerifiedBackup(options.backupFile, options.passphrase);
  const exists = existsSync(destination);
  if (exists && !options.keepExistingAsBak) throw new BackupError('destination-exists', 'Destination already exists; choose a new path or pass the explicit keep-as-.bak option.');
  if (!exists) for (const suffix of ['-wal', '-shm']) if (existsSync(destination + suffix)) throw new BackupError('destination-exists', 'Stale WAL/SHM files exist next to the destination.');
  await mkdir(dirname(destination), { recursive: true });
  const temp = `${destination}.restore-${randomUUID()}.tmp`;
  try {
    await writeFile(temp, plain, { flag: 'wx', mode: 0o600 });
    verifyPlainAgainstManifest(temp, manifest);
    let previousMovedTo: string | undefined;
    if (exists) {
      previousMovedTo = `${destination}.bak-${stamp(clock.now())}`;
      if (existsSync(previousMovedTo)) throw new BackupError('destination-exists', '.bak target already exists.');
      await rename(destination, previousMovedTo);
      // Sidecar WAL/SHM belong to the old database and must never pair with the restored file.
      for (const suffix of ['-wal', '-shm']) if (existsSync(destination + suffix)) await rename(destination + suffix, previousMovedTo + suffix);
    }
    await rename(temp, destination);
    return previousMovedTo ? { manifest, destination, previousMovedTo } : { manifest, destination };
  } finally { await rm(temp, { force: true }); }
}

// ---------- listing and rotation ----------

export interface ListedBackup { manifest: BackupManifest; file: string; manifestFile: string }
/** Only files created by this package: valid name pattern + valid manifest (createdBy). */
export async function listBackups(backupDir: string = defaultBackupDir()): Promise<ListedBackup[]> {
  const dir = resolve(backupDir);
  let names: string[];
  try { names = await readdir(dir); } catch { return []; }
  const result: ListedBackup[] = [];
  for (const name of names) {
    if (!name.endsWith(MANIFEST_SUFFIX)) continue;
    const dataName = name.slice(0, -MANIFEST_SUFFIX.length);
    if (!NAME_RE.test(dataName)) continue;
    try {
      const info = await lstat(join(dir, name));
      if (!info.isFile()) continue;
      const manifest = manifestSchema.parse(JSON.parse(await readFile(join(dir, name), 'utf8')));
      if (manifest.file !== dataName) continue;
      result.push({ manifest, file: join(dir, dataName), manifestFile: join(dir, name) });
    } catch { /* not ours or unreadable: ignore */ }
  }
  return result.sort((a, b) => b.manifest.createdAt - a.manifest.createdAt || b.manifest.file.localeCompare(a.manifest.file));
}

export interface RotationPolicy { daily?: number; weekly?: number }
const BRT_OFFSET = -3 * 3600_000;
const dayKey = (ms: number): number => Math.floor((ms + BRT_OFFSET) / 86_400_000);
const weekKey = (ms: number): number => Math.floor((dayKey(ms) + 3) / 7); // weeks start Monday (day 0 = Thursday)

/** Pure selection: newest per day for `daily` days, then newest per week for `weekly` weeks among the rest. */
export function selectBackupsToKeep(backups: readonly ListedBackup[], policy: RotationPolicy = {}): Set<ListedBackup> {
  const daily = policy.daily ?? 14, weekly = policy.weekly ?? 4;
  if (!Number.isInteger(daily) || !Number.isInteger(weekly) || daily < 1 || weekly < 0) throw new Error('Invalid rotation policy');
  const keep = new Set<ListedBackup>();
  const days = new Set<number>();
  for (const backup of backups) { // already newest first
    const key = dayKey(backup.manifest.createdAt);
    if (!days.has(key) && days.size < daily) { days.add(key); keep.add(backup); }
  }
  const weeks = new Set<number>();
  for (const backup of backups) {
    if (keep.has(backup)) continue;
    const key = weekKey(backup.manifest.createdAt);
    if (!weeks.has(key) && weeks.size < weekly) { weeks.add(key); keep.add(backup); }
  }
  return keep;
}

export async function rotateBackups(options: { backupDir: string; policy?: RotationPolicy; log?: (m: string) => void }): Promise<string[]> {
  const dir = resolve(options.backupDir);
  const all = await listBackups(dir);
  const keep = selectBackupsToKeep(all, options.policy);
  const deleted: string[] = [];
  for (const backup of all) {
    if (keep.has(backup)) continue;
    for (const path of [backup.file, backup.manifestFile]) {
      const resolved = resolve(path);
      // Hard guard: direct child of the backup folder, matching our own naming pattern.
      if (dirname(resolved) !== dir || !resolved.startsWith(dir + sep)) continue;
      if (!NAME_RE.test(basename(resolved).replace(MANIFEST_SUFFIX, ''))) continue;
      try { if ((await lstat(resolved)).isFile()) await rm(resolved, { force: true }); } catch { /* already gone */ }
    }
    deleted.push(backup.manifest.file);
  }
  if (deleted.length) options.log?.(`rotation removed ${deleted.length} old backup(s)`);
  return deleted;
}
