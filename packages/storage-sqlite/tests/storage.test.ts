import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createBot, FakeWhatsAppAdapter, InMemoryAuditLog, InMemoryGroupRouteRegistry, InMemoryMemberRepository, InMemorySeenMessageStore, InMemoryXpLedger, type Member, type XpTransaction } from '../../core/src/index.js';
import { SqliteStorage } from '../src/index.js';

const member: Member = { id: 'synthetic-member', name: 'Synthetic', identities: [{ platformUserId: 'synthetic-user' }], status: 'active', registeredAt: 0 };
const entry: XpTransaction = { id: 'synthetic-xp', memberId: member.id, amount: 10, occurredAt: 0, source: 'manual', sourceId: 'synthetic-evidence', actorId: 'synthetic-admin', reason: 'Synthetic award' };
const routes = [{ platformGroupId: 'synthetic-group', allowedCommands: ['ping', 'registrar'] }];
const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
function tempPath() {
  const dir = mkdtempSync(join(tmpdir(), 'aerobot-synthetic-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'test.sqlite');
}
function sqlite(path: string) { const store = new SqliteStorage(path, routes); cleanup.push(() => store.close()); return store; }
const factories = {
  memory: () => ({ members: new InMemoryMemberRepository(), ledger: new InMemoryXpLedger(), audit: new InMemoryAuditLog(), routes: new InMemoryGroupRouteRegistry(routes), seenMessages: new InMemorySeenMessageStore() }),
  'sqlite :memory:': () => sqlite(':memory:'),
  'sqlite file': () => sqlite(tempPath())
};
for (const [name, factory] of Object.entries(factories)) describe(`storage contract: ${name}`, () => {
  it('registers unique identities atomically and returns detached members/routes', async () => {
    const s = factory();
    expect(await s.members.register(member)).toBe(true);
    expect(await s.members.register(member)).toBe(false);
    expect(await s.members.register({ ...member, id: 'other', identities: [{ platformUserId: 'new' }, ...member.identities] })).toBe(false);
    expect(await s.members.findByIdentity('new')).toBeUndefined();
    expect(await s.members.findByIdentity('missing')).toBeUndefined();
    const found = await s.members.findByIdentity('synthetic-user');
    expect(found).toEqual(member);
    Object.assign(found!, { name: 'mutated' });
    expect(await s.members.findByIdentity('synthetic-user')).toEqual(member);
    expect(await s.routes.find('synthetic-group')).toEqual(routes[0]);
    expect(await s.routes.find('missing')).toBeUndefined();
  });
  it('keeps append-only immutable XP with unique IDs/sources and validates awards', async () => {
    const s = factory();
    expect(await s.ledger.append(entry)).toBe(true);
    expect(await s.ledger.append({ ...entry, id: 'other' })).toBe(false);
    expect(await s.ledger.append({ ...entry, sourceId: 'other' })).toBe(false);
    await expect(s.ledger.append({ ...entry, amount: 0 })).rejects.toThrow();
    const snapshot = await s.ledger.list(member.id);
    expect(() => Object.assign(snapshot[0]!, { amount: 999 })).toThrow();
    expect(await s.ledger.append({ ...entry, id: 'correction', sourceId: 'correction', amount: -2 })).toBe(true);
    expect(snapshot).toHaveLength(1);
    expect((await s.ledger.list(member.id)).map(e => e.amount)).toEqual([10, -2]);
  });
  it('claims dedupe pairs atomically and persists audit events', async () => {
    const s = factory();
    expect(await Promise.all([s.seenMessages.claim('g', 'id', 0), s.seenMessages.claim('g', 'id', 0)])).toEqual([true, false]);
    expect(await s.seenMessages.claim('other', 'id', 0)).toBe(true);
    const event = { action: 'synthetic', actorId: 'synthetic-admin', subjectId: member.id, at: 0 };
    await s.audit.record(event);
    expect(s.audit.list()).toEqual([event]);
  });
  it('enforces the Sao Paulo cap across UTC midnight and resets at local midnight', async () => {
    const s = factory();
    await s.members.register(member);
    let now = Date.parse('2026-10-28T23:59:59Z');
    const bot = createBot({ ...s, adapter: new FakeWhatsAppAdapter(), clock: { now: () => now }, xpPolicy: { enabled: true, award: 10, dailyCap: 10, minIntervalMs: 0 } });
    const send = (id: string) => bot.receive({ id, groupId: 'synthetic-group', senderId: 'synthetic-user', text: `synthetic ${id}`, fromMe: false });
    await send('before-utc');
    now = Date.parse('2026-10-29T00:00:00Z'); await send('after-utc');
    now = Date.parse('2026-10-29T02:59:59Z'); await send('before-local');
    expect(await s.ledger.list(member.id)).toHaveLength(1);
    now = Date.parse('2026-10-29T03:00:00Z'); await send('after-local');
    expect(await s.ledger.list(member.id)).toHaveLength(2);
  });
});
it('retains members, XP, routes, audits and command dedupe after restart; migrations are idempotent', async () => {
  const path = tempPath();
  let s = new SqliteStorage(path, routes);
  await s.members.register(member); await s.ledger.append(entry);
  const adapter = new FakeWhatsAppAdapter();
  const message = { id: 'restart-command', groupId: 'synthetic-group', senderId: 'synthetic-user', text: '/ping', fromMe: false };
  await createBot({ ...s, adapter, clock: { now: () => 0 } }).receive(message);
  await s.audit.record({ action: 'synthetic', actorId: 'synthetic', subjectId: member.id, at: 0 });
  s.close();
  s = new SqliteStorage(path); cleanup.push(() => s.close());
  expect(await s.members.findByIdentity('synthetic-user')).toEqual(member);
  expect(await s.ledger.list(member.id)).toEqual([entry]);
  expect(await s.ledger.append({ ...entry, id: 'duplicate-after-restart' })).toBe(false);
  expect(await s.routes.find('synthetic-group')).toEqual(routes[0]);
  expect(s.audit.list()).toHaveLength(1);
  await createBot({ ...s, adapter, clock: { now: () => 10000 } }).receive(message);
  expect(adapter.sent).toHaveLength(1);
  const db = new DatabaseSync(path);
  try {
    expect(db.prepare('SELECT * FROM schema_version').all()).toEqual([{ version: 1 }]);
    expect(db.prepare('PRAGMA journal_mode').get()!.journal_mode).toBe('wal');
    expect(db.prepare('SELECT amount FROM xp_balance').get()!.amount).toBe(10);
    expect(() => db.exec('UPDATE xp_transaction SET payload = payload')).toThrow('Append-only');
    expect(() => db.exec('DELETE FROM xp_transaction')).toThrow('Append-only');
    db.exec("CREATE TRIGGER fail_balance BEFORE UPDATE ON xp_balance BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    await expect(s.ledger.append({ ...entry, id: 'rollback', sourceId: 'rollback' })).rejects.toThrow('synthetic failure');
    expect(await s.ledger.list(member.id)).toEqual([entry]);
  } finally { db.close(); }
});
it('bounds in-memory dedupe by LRU and age', async () => {
  const seen = new InMemorySeenMessageStore(2, 100);
  expect(await seen.claim('g', 'a', 0)).toBe(true);
  await seen.claim('g', 'b', 1);
  expect(await seen.claim('g', 'a', 2)).toBe(false);
  await seen.claim('g', 'c', 3);
  expect(await seen.claim('g', 'b', 4)).toBe(true);
  expect(await seen.claim('g', 'b', 104)).toBe(true);
});
