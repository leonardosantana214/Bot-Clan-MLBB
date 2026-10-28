import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorage } from '../../storage-sqlite/src/index.js';
import { atomicWrite, csv, csvCell, exportCsv, maskIdentity, saoPauloDate, SqliteExportSource, type ExportSnapshot } from '../src/index.js';
const folders: string[] = [];
async function folder() { const path = await mkdtemp(join(tmpdir(), 'aerobot-export-')); folders.push(path); return path; }
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe('CSV v1', () => {
  it('escapes quotes, newlines, separators and every formula prefix', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) expect(csvCell(prefix + 'cmd').replaceAll('"', '')).toBe("'" + prefix + 'cmd');
    expect(csvCell('ordinary')).toBe('ordinary');
  });
  it('keeps negative numbers numeric but still neutralizes numeric-looking text', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(0)).toBe('0');
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell(Number.NaN)).toBe('NaN');
  });
  it('writes UTF-8 BOM, CRLF and configurable separator', () => {
    expect(Buffer.from(csv([['a', 'b;c']], ';')).subarray(0, 3)).toEqual(Buffer.from([239, 187, 191]));
    expect(csv([['a', 'b;c']], ';')).toBe('\uFEFFa;"b;c"\r\n');
    expect(csv([['a', 'b']])).toBe('\uFEFFa,b\r\n');
  });
  it('masks the identifier by default and allows explicit full export', async () => {
    const outputFolder = await folder();
    const data: ExportSnapshot = { members: [{ id: 'm', name: '=formula', status: 'active', registeredAt: 0, identities: [{ platformUserId: '551199999999@s.whatsapp.net' }] }], xpTransactions: [], auditLog: [] };
    const options = { outputFolder, period: { start: '2026-01-01', endExclusive: '2026-01-02' } };
    await exportCsv({ snapshot: async () => data }, options);
    expect(await readFile(join(outputFolder, 'members_v1.csv'), 'utf8')).not.toContain('551199999999');
    await exportCsv({ snapshot: async () => data }, { ...options, fullWhatsAppIdentifiers: true });
    expect(await readFile(join(outputFolder, 'members_v1.csv'), 'utf8')).toContain('551199999999@s.whatsapp.net');
    expect(maskIdentity('123')).not.toBe('123');
  });
  it('atomically replaces a file and cleans temporary files on rename failure', async () => {
    const path = await folder(); const target = join(path, 'file.csv');
    await atomicWrite(target, 'old'); await atomicWrite(target, 'new');
    expect(await readFile(target, 'utf8')).toBe('new');
    await expect(atomicWrite(path, 'failure')).rejects.toThrow();
    expect(await readdir(path)).toEqual(['file.csv']);
  });
  it('reads SQLite and ranks ledger deltas inside local calendar boundaries', async () => {
    const path = await folder(); const dbPath = join(path, 'source.db'); const storage = new SqliteStorage(dbPath);
    await storage.members.register({ id: 'm', name: 'Synthetic', status: 'active', registeredAt: 0, identities: [] });
    for (const [id, at, amount] of [['before', '2026-01-01T02:59:59Z', 99], ['inside', '2026-01-01T03:00:00Z', 5], ['after', '2026-01-02T03:00:00Z', 99]] as const) await storage.ledger.append({ id, sourceId: id, memberId: 'm', amount, occurredAt: Date.parse(at), source: 'manual', actorId: 'admin', reason: 'synthetic' });
    await storage.audit.record({ action: 'synthetic', actorId: 'admin', subjectId: 'm', at: 0 }); storage.close();
    const source = new SqliteExportSource(dbPath);
    expect((await source.snapshot()).auditLog).toHaveLength(1);
    await exportCsv(source, { outputFolder: path, period: { start: '2026-01-01', endExclusive: '2026-01-02' } });
    expect(await readFile(join(path, 'rankings_v1.csv'), 'utf8')).toContain('1,2026-01-01,2026-01-02,1,m,5');
    expect(saoPauloDate(Date.parse('2026-01-01T03:00:00Z'))).toBe('2026-01-01T00:00:00.000-03:00');
    expect(saoPauloDate(Date.parse('2018-12-01T03:00:00Z'))).toContain('-02:00');
  });
});
