import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import type { AuditEvent, CommandContext, Member } from '@aerobot/core';
import { SqliteStorage } from '../../storage-sqlite/src/index.js';
import {
  BackupCryptoError, BackupError, SqliteRetentionStore, adminCommands, applyRetention, configureMaintenance, createAdminCommands, createBackup,
  decryptBuffer, encryptBuffer, listBackups, passphraseFromEnv, restoreBackup, rotateBackups, selectBackupsToKeep, verifyBackup
} from '../src/index.js';

const DAY = 86_400_000;
const PASS = 'correct horse battery staple';
const T0 = Date.UTC(2026, 9, 28, 15, 0, 0);
const folders: string[] = [];
async function folder(): Promise<string> { const p = await mkdtemp(join(tmpdir(), 'aerobot-maint-')); folders.push(p); return p; }
afterEach(async () => { await Promise.all(folders.splice(0).map(p => rm(p, { recursive: true, force: true }))); configureMaintenance(undefined); });

const member = (id: string, status: Member['status'], extra: Record<string, unknown> = {}): Member => ({ id, name: `Nome ${id}`, identities: [{ platformUserId: `5511${id}@s.whatsapp.net` }], status, registeredAt: 1, ...extra } as Member);

async function seed(dir: string, members = 3): Promise<string> {
  const path = join(dir, 'bot.sqlite');
  const storage = new SqliteStorage(path);
  for (let i = 0; i < members; i++) {
    const id = String(1000 + i);
    await storage.members.register(member(id, 'active'));
    await storage.ledger.append({ id: `tx${i}`, memberId: id, amount: 10 + i, occurredAt: T0 + i, source: 'manual', sourceId: `s${i}`, actorId: 'a', reason: 'seed' });
    await storage.audit.record({ action: 'seed', actorId: 'a', at: T0, subjectId: id });
  }
  await storage.seenMessages.claim('g', 'm1', T0);
  storage.close();
  return path;
}
const dump = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const out: Record<string, unknown[]> = {};
    for (const t of ['member', 'whatsapp_identity', 'xp_transaction', 'xp_balance', 'seen_message', 'audit_log', 'schema_version']) out[t] = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map(r => ({ ...r }));
    return out;
  } finally { db.close(); }
};
const clockAt = (t: number) => ({ now: () => t });

describe('encryption', () => {
  it('round-trips, uses a random salt/iv and a versioned header', () => {
    const plain = Buffer.from('dados sintéticos');
    const a = encryptBuffer(plain, PASS), b = encryptBuffer(plain, PASS);
    expect(a.subarray(0, 6).toString()).toBe('AEROBK');
    expect(a[6]).toBe(1);
    expect(a.equals(b)).toBe(false);
    expect(decryptBuffer(a, PASS).equals(plain)).toBe(true);
    expect(a.includes(plain)).toBe(false);
  });
  it('fails clearly with a wrong key, missing key, tampered body/header, truncation, or plain input', () => {
    const enc = encryptBuffer(Buffer.from('x'.repeat(100)), PASS);
    expect(() => decryptBuffer(enc, 'another passphrase!!')).toThrow(/Wrong passphrase or the backup file was modified/);
    expect(() => decryptBuffer(enc, undefined)).toThrow(/passphrase is required/);
    const body = Buffer.from(enc); body[body.length - 1] = body[body.length - 1]! ^ 1;
    expect(() => decryptBuffer(body, PASS)).toThrow(BackupCryptoError);
    const header = Buffer.from(enc); header[10] = header[10]! ^ 1; // salt byte
    expect(() => decryptBuffer(header, PASS)).toThrow(BackupCryptoError);
    expect(() => decryptBuffer(enc.subarray(0, 20), PASS)).toThrow(/truncated/);
    expect(() => decryptBuffer(Buffer.from('plain'), PASS)).toThrow(/not an encrypted/);
  });
  it('rejects weak passphrases and reads the env var only', () => {
    expect(() => encryptBuffer(Buffer.from('x'), 'short')).toThrow(/at least/);
    expect(passphraseFromEnv({ AEROBOT_BACKUP_PASSPHRASE: PASS })).toBe(PASS);
    expect(passphraseFromEnv({})).toBeUndefined();
  });
});

describe('backup', () => {
  it('creates a verified backup with manifest, hash, counts and schema version', async () => {
    const dir = await folder(); const db = await seed(dir);
    const result = await createBackup({ dbPath: db, backupDir: join(dir, 'b'), clock: clockAt(T0) });
    const m = result.manifest;
    expect(m).toMatchObject({ encrypted: false, schemaVersion: 1, createdAt: T0 });
    expect(m.tables).toMatchObject({ member: 3, xp_transaction: 3, audit_log: 3, seen_message: 1, schema_version: 1 });
    expect(JSON.parse(await readFile(result.manifestFile, 'utf8')).sha256).toBe(m.sha256);
    expect(await verifyBackup(result.file)).toEqual(m);
    expect(dump(result.file)).toEqual(dump(db));
    expect((await readdir(join(dir, 'b'))).filter(n => n.includes('.tmp'))).toEqual([]);
  });
  it('is consistent while another thread writes concurrently (WAL)', async () => {
    const dir = await folder(); const db = await seed(dir, 1);
    const worker = new Worker(`
      const { DatabaseSync } = require('node:sqlite'); const { workerData, parentPort } = require('node:worker_threads');
      const d = new DatabaseSync(workerData); d.exec('PRAGMA busy_timeout = 10000');
      let i = 0; let stop = false; parentPort.on('message', () => { stop = true; });
      const step = () => {
        if (stop) { d.close(); parentPort.postMessage('done'); return; }
        d.exec('BEGIN IMMEDIATE');
        const id = 'w' + (i++);
        d.prepare('INSERT INTO xp_transaction (id, member_id, source, source_id, payload) VALUES (?, ?, ?, ?, ?)').run(id, 'wm', 'manual', id, JSON.stringify({ amount: 5 }));
        d.prepare('INSERT INTO xp_balance VALUES (?, ?) ON CONFLICT(member_id) DO UPDATE SET amount = amount + 5').run('wm', 5);
        d.exec('COMMIT'); setImmediate(step);
      };
      parentPort.postMessage('ready'); step();
    `, { eval: true, workerData: db });
    await new Promise(resolve => worker.once('message', resolve));
    try {
      for (let k = 0; k < 5; k++) {
        const r = await createBackup({ dbPath: db, backupDir: join(dir, 'b'), clock: clockAt(T0 + k), rotation: false });
        await verifyBackup(r.file);
        const copy = new DatabaseSync(r.file, { readOnly: true });
        const ledger = Number(copy.prepare("SELECT COALESCE(SUM(json_extract(payload, '$.amount')), 0) AS s FROM xp_transaction WHERE member_id = 'wm'").get()!.s);
        const balance = Number(copy.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM xp_balance WHERE member_id = 'wm'").get()!.s);
        copy.close();
        expect(balance).toBe(ledger); // ledger and balance written in one tx: a torn snapshot would differ
      }
    } finally {
      const done = new Promise(resolve => worker.once('message', resolve)); worker.postMessage('stop'); await done; await worker.terminate();
    }
  }, 60_000);
  it('encrypts, never stores or logs the passphrase, and round-trips through restore', async () => {
    const dir = await folder(); const db = await seed(dir);
    const logs: string[] = [];
    const r = await createBackup({ dbPath: db, backupDir: join(dir, 'b'), clock: clockAt(T0), passphrase: PASS, log: m => logs.push(m) });
    expect(r.file.endsWith('.enc')).toBe(true);
    expect(r.manifest.encrypted).toBe(true);
    const stored = await readFile(r.file);
    expect(stored.includes(Buffer.from('SQLite format 3'))).toBe(false);
    for (const text of [stored.toString('latin1'), await readFile(r.manifestFile, 'utf8'), logs.join('\n')]) expect(text).not.toContain(PASS);
    expect(logs.length).toBeGreaterThan(0);
    await expect(verifyBackup(r.file)).rejects.toThrow(/passphrase is required/);
    await expect(verifyBackup(r.file, 'wrong passphrase value')).rejects.toThrow(/Wrong passphrase/);
    const dest = join(dir, 'restored.sqlite');
    await restoreBackup({ backupFile: r.file, destination: dest, passphrase: PASS });
    expect(dump(dest)).toEqual(dump(db));
  });
  it('detects tampering (flipped byte) and manifest edits', async () => {
    const dir = await folder(); const db = await seed(dir);
    const r = await createBackup({ dbPath: db, backupDir: join(dir, 'b'), clock: clockAt(T0), passphrase: PASS });
    const bytes = await readFile(r.file); bytes[bytes.length - 3] = bytes[bytes.length - 3]! ^ 0xff;
    await writeFile(r.file, bytes);
    await expect(verifyBackup(r.file, PASS)).rejects.toMatchObject({ code: 'hash-mismatch' });
    const r2 = await createBackup({ dbPath: db, backupDir: join(dir, 'b2'), clock: clockAt(T0) });
    const manifest = JSON.parse(await readFile(r2.manifestFile, 'utf8')); manifest.tables.member = 99;
    await writeFile(r2.manifestFile, JSON.stringify(manifest));
    await expect(verifyBackup(r2.file)).rejects.toMatchObject({ code: 'count-mismatch' });
    await writeFile(r2.manifestFile, '{not json');
    await expect(verifyBackup(r2.file)).rejects.toMatchObject({ code: 'invalid-manifest' });
  });
  it('refuses a corrupted backup even when the manifest hash was recomputed', async () => {
    const dir = await folder(); const db = await seed(dir);
    const r = await createBackup({ dbPath: db, backupDir: join(dir, 'b'), clock: clockAt(T0) });
    const bytes = await readFile(r.file);
    bytes.fill(0xab, 4096, 8192); // trash database pages
    const { createHash } = await import('node:crypto');
    const manifest = JSON.parse(await readFile(r.manifestFile, 'utf8'));
    manifest.sha256 = manifest.sha256Plain = createHash('sha256').update(bytes).digest('hex');
    await writeFile(r.file, bytes); await writeFile(r.manifestFile, JSON.stringify(manifest));
    const dest = join(dir, 'out.sqlite');
    await expect(restoreBackup({ backupFile: r.file, destination: dest })).rejects.toBeInstanceOf(BackupError);
    expect(existsSync(dest)).toBe(false);
  });
  it('refuses a source that is not an AeroBot database', async () => {
    const dir = await folder(); const path = join(dir, 'other.sqlite');
    const d = new DatabaseSync(path); d.exec('CREATE TABLE t (x)'); d.close();
    await expect(createBackup({ dbPath: path, backupDir: join(dir, 'b') })).rejects.toMatchObject({ code: 'source-invalid' });
    expect(await readdir(join(dir, 'b'))).toEqual([]);
  });
});

describe('restore', () => {
  it('round-trips identical data into a new file and never overwrites by default', async () => {
    const dir = await folder(); const db = await seed(dir);
    const r = await createBackup({ dbPath: db, backupDir: join(dir, 'b'), clock: clockAt(T0) });
    const before = dump(db);
    // live database changes after the backup
    const s = new SqliteStorage(db); await s.members.register(member('9999', 'active')); s.close();
    const fresh = join(dir, 'fresh.sqlite');
    await restoreBackup({ backupFile: r.file, destination: fresh });
    expect(dump(fresh)).toEqual(before);
    expect(dump(db).member).toHaveLength(4);
    await expect(restoreBackup({ backupFile: r.file, destination: db })).rejects.toMatchObject({ code: 'destination-exists' });
    expect(dump(db).member).toHaveLength(4); // untouched
    // the restored file is usable by the real storage layer
    const reopened = new SqliteStorage(fresh);
    expect((await reopened.members.list!())).toHaveLength(3);
    reopened.close();
  });
  it('with the explicit flag, renames the existing database to .bak-<timestamp> instead of deleting it', async () => {
    const dir = await folder(); const db = await seed(dir);
    const r = await createBackup({ dbPath: db, backupDir: join(dir, 'b'), clock: clockAt(T0) });
    const s = new SqliteStorage(db); await s.members.register(member('9999', 'active')); s.close();
    const res = await restoreBackup({ backupFile: r.file, destination: db, keepExistingAsBak: true, clock: clockAt(T0) });
    expect(res.previousMovedTo).toMatch(/\.bak-\d{8}T\d{9}Z$/);
    expect(dump(res.previousMovedTo!).member).toHaveLength(4);
    expect(dump(db).member).toHaveLength(3);
  });
});

describe('rotation', () => {
  it('keeps 14 daily + 4 weekly (pure selection)', () => {
    const list = Array.from({ length: 60 }, (_, i) => ({ manifest: { createdAt: T0 - i * DAY, file: `f${i}` }, file: '', manifestFile: '' }) as never);
    const keep = selectBackupsToKeep(list, { daily: 14, weekly: 4 });
    expect(keep.size).toBe(18);
    for (let i = 0; i < 14; i++) expect(keep.has(list[i]!)).toBe(true);
  });
  it('only deletes files the package created, only inside the backup folder', async () => {
    const dir = await folder(); const db = await seed(dir);
    const bdir = join(dir, 'b'); await mkdir(bdir, { recursive: true });
    const outside = join(dir, 'aerobot-backup-20200101T000000000Z-deadbeef.sqlite');
    const foreign = [join(bdir, 'notes.txt'), join(bdir, 'aerobot-backup-20200101T000000000Z-deadbeef.sqlite'), join(bdir, 'aerobot-backup-manual.sqlite'), join(bdir, 'x.manifest.json'), outside];
    for (const f of foreign) await writeFile(f, 'keep me');
    for (let i = 0; i < 5; i++) await createBackup({ dbPath: db, backupDir: bdir, clock: clockAt(T0 - (4 - i) * DAY), rotation: false });
    expect((await listBackups(bdir))).toHaveLength(5);
    const deleted = await rotateBackups({ backupDir: bdir, policy: { daily: 2, weekly: 0 } });
    expect(deleted).toHaveLength(3);
    expect(await listBackups(bdir)).toHaveLength(2);
    for (const f of foreign) expect(await readFile(f, 'utf8')).toBe('keep me');
  });
  it('rotates automatically after a backup and always keeps the newest', async () => {
    const dir = await folder(); const db = await seed(dir); const bdir = join(dir, 'b');
    for (let i = 0; i < 4; i++) await createBackup({ dbPath: db, backupDir: bdir, clock: clockAt(T0 + i * DAY), rotation: { daily: 2, weekly: 0 } });
    const left = await listBackups(bdir);
    expect(left.map(b => b.manifest.createdAt)).toEqual([T0 + 3 * DAY, T0 + 2 * DAY]);
    expect((await readdir(bdir)).length).toBe(4);
  });
});

describe('retention', () => {
  async function seedRetention() {
    const dir = await folder(); const db = join(dir, 'bot.sqlite');
    const s = new SqliteStorage(db);
    const now = T0;
    await s.members.register(member('1', 'left', { leftAt: now - 100 * DAY }));         // due
    await s.members.register(member('2', 'left', { leftAt: now - 10 * DAY }));          // too recent
    await s.members.register(member('3', 'deleted'));                                    // date from audit
    await s.members.register(member('4', 'active'));                                     // never touched
    await s.members.register(member('5', 'left'));                                       // no date: skipped
    await s.audit.record({ action: 'member.deleted', actorId: 'admin', at: now - 120 * DAY, subjectId: '3' });
    await s.ledger.append({ id: 't1', memberId: '1', amount: 5, occurredAt: now - 99 * DAY, source: 'manual', sourceId: 'x', actorId: 'a', reason: 'r' });
    await s.seenMessages.claim('g', 'old', now - 40 * DAY);
    await s.seenMessages.claim('g', 'new', now - 1 * DAY);
    s.close();
    return { db, now };
  }
  it('dry-run (default) reports and audits but changes no data', async () => {
    const { db, now } = await seedRetention();
    const store = new SqliteRetentionStore(db);
    const before = dump(db);
    const report = await applyRetention({ store, audit: store.audit, clock: clockAt(now), actorId: 'job' });
    store.close();
    expect(report.dryRun).toBe(true);
    expect([...report.membersToAnonymize].sort()).toEqual(['1', '3']);
    expect(report.technicalLogsAffected).toBe(1);
    expect(report.membersSkippedWithoutDate).toBe(1);
    const after = dump(db);
    expect({ ...after, audit_log: [] }).toEqual({ ...before, audit_log: [] });
    expect(after.audit_log).toHaveLength((before.audit_log?.length ?? 0) + 1);
  });
  it('real run anonymizes only due departed members, keeps ledger/audit, purges old technical logs, and audits everything', async () => {
    const { db, now } = await seedRetention();
    const store = new SqliteRetentionStore(db);
    const report = await applyRetention({ store, audit: store.audit, clock: clockAt(now), actorId: 'job', execute: true });
    expect(report).toMatchObject({ dryRun: false, membersAnonymized: 2, technicalLogsAffected: 1 });
    const again = await applyRetention({ store, audit: store.audit, clock: clockAt(now), actorId: 'job', execute: true });
    expect(again.membersAnonymized).toBe(0); // idempotent
    store.close();
    const s = new SqliteStorage(db);
    const members = await s.members.list!();
    const by = (id: string) => members.find(m => m.id === id)!;
    expect(by('1')).toMatchObject({ name: 'Anonimizado', identities: [], status: 'left' });
    expect(by('3')).toMatchObject({ name: 'Anonimizado', identities: [] });
    expect(by('2').name).toBe('Nome 2');
    expect(by('4').identities).toHaveLength(1);
    expect(by('5').name).toBe('Nome 5');
    expect(await s.members.findByIdentity('55111@s.whatsapp.net')).toBeUndefined();
    expect(await s.ledger.list('1')).toHaveLength(1);
    const audit = s.audit.list();
    expect(audit.filter(e => e.action === 'retention.member.anonymize').map(e => e.subjectId).sort()).toEqual(['1', '3']);
    expect(audit.some(e => e.action === 'member.deleted')).toBe(true);
    expect(audit.some(e => e.action === 'retention.run')).toBe(true);
    expect(await s.seenMessages.claim('g', 'old', now)).toBe(true); // purged => claimable again
    expect(await s.seenMessages.claim('g', 'new', now)).toBe(false); // recent kept
    s.close();
  });
  it('validates the policy and respects configurable values', async () => {
    const { db, now } = await seedRetention();
    const store = new SqliteRetentionStore(db);
    await expect(applyRetention({ store, audit: store.audit, clock: clockAt(now), actorId: 'j', policy: { departedMemberDays: 0 } })).rejects.toThrow(/Invalid retention/);
    const r = await applyRetention({ store, audit: store.audit, clock: clockAt(now), actorId: 'j', policy: { departedMemberDays: 5 } });
    expect([...r.membersToAnonymize].sort()).toEqual(['1', '2', '3']);
    store.close();
  });
  it('append-only triggers still block direct mutation of ledger/audit', async () => {
    const { db } = await seedRetention();
    const d = new DatabaseSync(db);
    expect(() => d.exec('DELETE FROM xp_transaction')).toThrow(/Append-only/);
    expect(() => d.exec('UPDATE audit_log SET payload = payload')).toThrow(/Append-only/);
    d.close();
  });
});

describe('admin commands', () => {
  const sent: AuditEvent[] = [];
  const ctx = (sender = 'admin'): CommandContext => ({ message: { id: 'm', groupId: 'g', senderId: sender, text: '', fromMe: false }, clock: clockAt(T0), audit: { record: async (e: AuditEvent) => { sent.push(e); } } }) as unknown as CommandContext;
  it('are pt-BR, named and not configured by default', async () => {
    expect(adminCommands.map(c => c.name)).toEqual(['backup', 'statusbackup']);
    for (const c of adminCommands) expect(c.description).toMatch(/administração/);
    expect(await adminCommands[0]!.handle(ctx(), [])).toMatch(/não configurada/);
  });
  it('/backup answers size/hash/time without path or secrets, audits, and /statusbackup reports age and staleness', async () => {
    const dir = await folder(); const db = await seed(dir); const bdir = join(dir, 'secret-folder');
    const logs: string[] = [];
    const now = { t: T0 };
    configureMaintenance({ dbPath: db, backupDir: bdir, getPassphrase: () => PASS, clock: { now: () => now.t }, log: m => logs.push(m), allowedSenderIds: ['admin'] });
    const [backup, status] = adminCommands as [typeof adminCommands[0], typeof adminCommands[0]];
    expect(await status.handle(ctx(), [])).toMatch(/nenhum backup/);
    const answer = await backup.handle(ctx(), []);
    expect(answer).toMatch(/^Backup concluído: [\d,]+ (B|KB|MB), hash [0-9a-f]{8}, \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \(BRT\), criptografado\.$/);
    for (const text of [answer, logs.join(' ')]) { expect(text).not.toContain(PASS); expect(text).not.toContain('secret-folder'); expect(text).not.toContain(dir); }
    expect(sent.at(-1)).toMatchObject({ action: 'backup.create', actorId: 'admin' });
    now.t = T0 + 2 * 3_600_000;
    const fresh = await status.handle(ctx(), []);
    expect(fresh).toMatch(/há 2 h 0 min/); expect(fresh).not.toMatch(/ATENÇÃO/); expect(fresh).not.toContain('secret-folder');
    now.t = T0 + 37 * 3_600_000;
    expect(await status.handle(ctx(), [])).toMatch(/ATENÇÃO: backup com mais de 36 h/);
    expect(await backup.handle(ctx('intruder'), [])).toMatch(/restrito/);
    for (const c of adminCommands) expect(c.input.safeParse(['x']).success).toBe(false);
  });
  it('reports failure generically without leaking details', async () => {
    const dir = await folder();
    const cmds = createAdminCommands(() => ({ dbPath: join(dir, 'missing.sqlite'), backupDir: join(dir, 'b'), log: () => undefined }));
    const answer = await cmds[0]!.handle(ctx(), []);
    expect(answer).toBe('Falha ao criar o backup. Consulte os logs do servidor.');
  });
});
