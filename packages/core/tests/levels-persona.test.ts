import { SqliteLevelEvents } from '../../community/src/level-events.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SqliteStorage } from '../../storage-sqlite/src/index.js';
import { composeHost } from '../../whatsapp-baileys/src/compose.js';
import { FakeWhatsAppAdapter, InMemoryLevelEvents, InMemoryXpLedger, Persona, progressionConfiguration, royalPhrases, type XpTransaction } from '../src/index.js';
const entry = (id: string, amount: number, occurredAt = 100): XpTransaction => ({ id, memberId: 'm', amount, occurredAt, source: 'manual', sourceId: id, actorId: 'test', reason: 'Synthetic fixture' });
for (const kind of ['memory', 'sqlite'] as const) describe(kind, () => {
  it('records one and multiple crossings once, no downward event; member/time filters and immutable snapshots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aero-level-'));
    const path = join(dir, 'test.sqlite');
    const storage = kind === 'sqlite' ? new SqliteStorage(path) : undefined;
    const events = kind === 'sqlite' ? new SqliteLevelEvents(path) : new InMemoryLevelEvents();
    try {
      const ledger = events.wrap(storage?.ledger ?? new InMemoryXpLedger());
      expect(await ledger.append(entry('one', 200))).toBe(true);
      expect(await ledger.append(entry('one', 200))).toBe(false);
      expect(await ledger.append({ ...entry('one', 200), id: 'duplicate-source' })).toBe(false);
      expect(await ledger.append(entry('many', 10000, 200))).toBe(true);
      await ledger.append(entry('correction', -10000, 300));
      const history = await events.list('m', 0, 300);
      expect(history.map(e => [e.previousLevel, e.newLevel])).toEqual([[0, 1], [1, 4]]);
      expect(history.map(e => e.totalXp)).toEqual([200, 10200]);
      expect(await events.list('other', 0, 1000)).toEqual([]);
      expect(await events.list(undefined, 200, 300)).toHaveLength(1);
      Object.assign(history[0]!, { totalXp: 0 });
      expect((await events.list('m', 0, 200))[0]?.totalXp).toBe(200);
      if (storage) {
        const db = new DatabaseSync(path);
        try {
          expect(() => db.exec('UPDATE level_events SET total_xp = 0')).toThrow('Append-only');
          expect(() => db.exec('DELETE FROM level_events')).toThrow('Append-only');
          db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON level_events BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
          await expect(ledger.append(entry('rollback', 50000))).rejects.toThrow('test failure');
          expect((await ledger.list('m')).some(e => e.id === 'rollback')).toBe(false);
        } finally { db.close(); }
      }
    } finally {
      if (events instanceof SqliteLevelEvents) events.close();
      storage?.close(); await rm(dir, { recursive: true, force: true });
    }
  });
});
it('notifies once to CHAT, respects pause, protects names and persists history on restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aero-host-level-'));
  const adapter = Object.assign(new FakeWhatsAppAdapter(), { responsesPaused: false });
  const options = { adapter, sessionDir: dir, groupId: 'chat', adminGroupId: 'adm', log: () => {} };
  let host = composeHost(options);
  try {
    await host.storage.members.register({ id: 'm', name: 'Pessoa Teste', identities: [{ platformUserId: 'synthetic-user' }], status: 'active', registeredAt: 0 });
    await host.storage.ledger.append(entry('one', 200));
    await host.storage.ledger.append(entry('one', 200));
    await host.storage.ledger.append(entry('many', 10000));
    await host.storage.ledger.append(entry('negative', -10000));
    expect(adapter.sent).toHaveLength(2);
    expect(adapter.sent.every(e => e.groupId === 'chat')).toBe(true);
    expect(adapter.sent[0]?.text).toBe('Parabéns, Pessoa Teste! Nível 1. Faltam 932 XP para o próximo nível.');
    expect(adapter.sent[0]?.text).toContain('932 XP');
    expect(adapter.sent[1]?.text).toContain('4');
    adapter.responsesPaused = true;
    await host.storage.ledger.append(entry('paused', 50000));
    expect(adapter.sent).toHaveLength(2);
    expect(await host.levelEvents.list('m', 0, 1000)).toHaveLength(3);
    await host.close(); host = composeHost(options);
    await host.storage.ledger.append(entry('paused', 50000));
    expect(adapter.sent).toHaveLength(2);
    expect(await host.levelEvents.list('m', 0, 1000)).toHaveLength(3);
  } finally { await host.close(); await rm(dir, { recursive: true, force: true }); }
});
it('XP message opt-in uses the configured policy; ADM never receives celebrations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aero-xp-optin-'));
  const adapter = new FakeWhatsAppAdapter();
  const host = composeHost({ adapter, sessionDir: dir, groupId: 'chat', adminGroupId: 'adm', persona: 'conselheiro', xpPolicy: { enabled: true, award: 200, dailyCap: 200, minIntervalMs: 60000 }, clock: { now: () => 100 }, log: () => {} });
  try {
    await host.storage.members.register({ id: 'm', name: '5511 99999-0000@s.whatsapp.net', identities: [{ platformUserId: 'synthetic-user' }], status: 'active', registeredAt: 0 });
    const message = { id: 'msg', groupId: 'chat', senderId: 'synthetic-user', text: 'Synthetic activity', fromMe: false };
    await host.receive(message); await host.receive(message);
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]?.groupId).toBe('chat');
    expect(adapter.sent[0]?.text).not.toMatch(/5511|whatsapp|@/u);
    expect(royalPhrases.levelUp).toContain(adapter.sent[0]?.text.split('\n')[0]);
    expect(await host.levelEvents.list('m', 0, 1000)).toHaveLength(1);
  } finally { await host.close(); await rm(dir, { recursive: true, force: true }); }
});
it('preserves the exact payload for every persona situation, with short non-repeating frames', () => {
  const royal = new Persona('conselheiro', () => 0);
  const neutral = new Persona();
  const payload = 'Pessoa Teste | /xp | id:test | XP: 1234 | Level: 4 | Rank: 2';
  for (const kind of Object.keys(royalPhrases) as (keyof typeof royalPhrases)[]) {
    expect(royalPhrases[kind]).toHaveLength(4);
    const first = royal.render(payload, kind), second = royal.render(payload, kind);
    expect(first).not.toBe(second);
    expect(first.split('\n').slice(1).join('\n')).toBe(neutral.render(payload, kind));
    expect(first.length - payload.length).toBeLessThan(70);
    expect(first).not.toMatch(/whatsapp|@/u);
    expect(first).not.toContain('?');
  }
});

it('validates configurable host policy and keeps opt-ins safe', () => {
  expect(progressionConfiguration({})).toMatchObject({ xpPolicy: { enabled: false, award: 10, dailyCap: 100, minIntervalMs: 60000 }, levelFormula: { baseXp: 200, exponent: 2.5 }, persona: 'neutro' });
  expect(progressionConfiguration({ AEROBOT_XP_ENABLED: 'true' }).xpPolicy.enabled).toBe(false);
  expect(progressionConfiguration({ AEROBOT_XP_ENABLED: '1', AEROBOT_PERSONA: 'conselheiro', AEROBOT_XP_AWARD: '5', AEROBOT_LEVEL_EXPONENT: '3' })).toMatchObject({ xpPolicy: { enabled: true, award: 5 }, persona: 'conselheiro', levelFormula: { exponent: 3 } });
  for (const bad of [{ AEROBOT_XP_DAILY_CAP: '-1' }, { AEROBOT_XP_AWARD: '0' }, { AEROBOT_XP_MIN_INTERVAL_MS: '0.5' }, { AEROBOT_LEVEL_EXPONENT: 'NaN' }, { AEROBOT_LEVEL_BASE_XP: '' }]) expect(() => progressionConfiguration(bad)).toThrow();
});
it('applies one persona frame to core, star, community and maintenance output without changing data', async () => {
  const results: string[][] = [];
  for (const persona of ['neutro', 'conselheiro'] as const) {
    const dir = await mkdtemp(join(tmpdir(), 'aero-persona-'));
    const adapter = new FakeWhatsAppAdapter();
    let now = 100000;
    const host = composeHost({ adapter, persona, sessionDir: dir, groupId: 'chat', adminGroupId: 'adm', clock: { now: () => now }, log: () => {} });
    try {
      let id = 0;
      // Synthetic WhatsApp identity must not appear in a profile or any other public output.
      for (const command of ['/registrar Pessoa Teste', '/perfil', '/xp', '/rank', '/ping', '/ping extra', '/not-a-command', '/estrela', '/minhasadvertencias', '/statusbackup']) {
        now += 2000;
        await host.receive({ id: String(++id), groupId: command === '/statusbackup' ? 'adm' : 'chat', senderId: 'synthetic-user@s.whatsapp.net', text: command, fromMe: false });
      }
      expect(adapter.sent).toHaveLength(10);
      expect(adapter.sent.map(e => e.text).join('')).not.toMatch(/whatsapp|synthetic-user|@/u);
      results.push(adapter.sent.map(e => e.text));
    } finally { await host.close(); await rm(dir, { recursive: true, force: true }); }
  }
  expect(results[1]!.map(text => text.slice(text.indexOf('\n') + 1))).toEqual(results[0]);
});
