import { describe, expect, it } from 'vitest';
import { calculateLevel, createBot, FakeWhatsAppAdapter, InMemoryAuditLog, InMemoryGroupRouteRegistry, InMemoryMemberRepository, InMemoryXpLedger, xpBalance, type IncomingMessage, type XpTransaction } from '../src/index.js';

function fixture(enabled = true) {
  let now = Date.UTC(2026, 0, 1);
  const members = new InMemoryMemberRepository();
  const ledger = new InMemoryXpLedger();
  const adapter = new FakeWhatsAppAdapter();
  const audit = new InMemoryAuditLog();
  const bot = createBot({ members, ledger, adapter, audit, clock: { now: () => now }, routes: new InMemoryGroupRouteRegistry([{ platformGroupId: 'synthetic-group', allowedCommands: ['ping', 'ajuda', 'registrar', 'perfil', 'xp'] }]), commandIntervalMs: 1000, xpPolicy: { enabled, award: 10, dailyCap: 25, minIntervalMs: 1000 } });
  let sequence = 0;
  const send = (text: string, overrides: Partial<IncomingMessage> = {}) => bot.receive({ id: String(++sequence), senderId: 'synthetic-user', groupId: 'synthetic-group', text, fromMe: false, ...overrides });
  return { members, ledger, adapter, audit, send, advance: (ms: number) => { now += ms; }, entries: () => ledger.list('aero:synthetic-user') };
}

describe('SIMPLE core', () => {
  it('permite reentrega após falha no handler e no envio', async () => {
    const f = fixture();
    const original = f.adapter.sendMessage.bind(f.adapter);
    let fail = true;
    f.adapter.sendMessage = async (group, text) => { if (fail) { fail = false; throw new Error('synthetic send failure'); } await original(group, text); };
    await expect(f.send('/ping', { id: 'retry' })).rejects.toThrow('synthetic');
    await f.send('/ping', { id: 'retry' });
    expect(f.adapter.sent).toHaveLength(1);
    await f.send('/ping', { id: 'retry' });
    expect(f.adapter.sent).toHaveLength(1);
  });
  it('deduplicates concurrent messages and commands; ignores own messages', async () => {
    const f = fixture();
    await Promise.all([f.send('/registrar Player', { id: 'same' }), f.send('/registrar Player', { id: 'same' })]);
    expect(f.adapter.sent).toHaveLength(1);
    await Promise.all([f.send('hello', { id: 'xp' }), f.send('hello', { id: 'xp' })]);
    f.advance(2000);
    await f.send('bot', { fromMe: true });
    await f.send('/ping', { fromMe: true });
    expect(await f.entries()).toHaveLength(1);
    expect(f.adapter.sent).toHaveLength(1);
  });
  it('enforces interval, repetition, partial daily cap, and day rollover', async () => {
    const f = fixture();
    await f.send('/registrar Player');
    await f.send('first');
    await f.send('too soon');
    f.advance(1000);
    await f.send(' FIRST  ');
    await f.send('second');
    f.advance(1000);
    await f.send('third');
    f.advance(1000);
    await f.send('fourth');
    expect((await f.entries()).map(e => e.amount)).toEqual([10, 10, 5]);
    f.advance(86_400_000);
    await f.send('first');
    expect(xpBalance(await f.entries())).toBe(35);
  });
  it('does not award XP by default or to unregistered members', async () => {
    const f = fixture(false);
    await f.send('/registrar Player');
    await f.send('text');
    expect(await f.entries()).toEqual([]);
    const g = fixture();
    await g.send('text');
    expect(await g.entries()).toEqual([]);
    const members = new InMemoryMemberRepository();
    const ledger = new InMemoryXpLedger();
    const bot = createBot({ members, ledger, adapter: new FakeWhatsAppAdapter(), routes: new InMemoryGroupRouteRegistry(), clock: { now: () => 0 }, audit: new InMemoryAuditLog() });
    await members.register({ id: 'm', name: 'Synthetic', identities: [{ platformUserId: 'u' }], status: 'active', registeredAt: 0 });
    await bot.receive({ id: '1', senderId: 'u', groupId: 'g', text: 'text', fromMe: false });
    expect(await ledger.list('m')).toEqual([]);
  });
  it('calculates deterministic levels at exact boundaries with configurable formula', () => {
    expect([0, 199, 200, 1131, 1132, 3118, -10].map(x => calculateLevel(x))).toEqual([0, 0, 1, 1, 2, 3, 0]);
    expect(calculateLevel(300, { baseXp: 50, exponent: 1 })).toBe(6);
    expect(() => calculateLevel(10, { baseXp: 0, exponent: 2 })).toThrow();
  });
  it('rejects duplicate registration without replacing identity or emitting another audit', async () => {
    const f = fixture();
    await f.send('/registrar Original');
    f.advance(1000);
    await f.send('/registrar Replacement');
    expect(f.adapter.sent.at(-1)?.text).toContain('já');
    expect((await f.members.findByIdentity('synthetic-user'))?.name).toBe('Original');
    expect(f.audit.list()).toHaveLength(1);
  });
  it('ignores commands in unknown or disallowed routes', async () => {
    const f = fixture();
    await f.send('/registrar Player', { groupId: 'unconfigured' });
    expect(f.adapter.sent).toHaveLength(0);
    expect(await f.members.findByIdentity('synthetic-user')).toBeUndefined();
    const adapter = new FakeWhatsAppAdapter();
    const bot = createBot({ adapter, members: f.members, ledger: f.ledger, audit: f.audit, clock: { now: () => 0 }, routes: new InMemoryGroupRouteRegistry([{ platformGroupId: 'restricted', allowedCommands: ['ping'] }]) });
    await bot.receive({ id: 'r', groupId: 'restricted', senderId: 'u', text: '/registrar Player', fromMe: false });
    expect(adapter.sent).toEqual([]);
  });
  it('validates arguments, rate limits users, and serves all commands', async () => {
    const f = fixture();
    await f.send('/registrar');
    expect(f.adapter.sent.at(-1)?.text).toContain('inválidos');
    await f.send('/ping');
    expect(f.adapter.sent).toHaveLength(1);
    for (const command of ['/ping', '/ajuda', '/registrar Player', '/perfil', '/xp']) {
      f.advance(1000); await f.send(command);
    }
    expect(f.adapter.sent.map(m => m.text)).toEqual(expect.arrayContaining(['pong', expect.stringContaining('/ajuda'), 'Registro criado: Player.', expect.stringContaining('active'), 'XP: 0 · Nível: 0']));
  });
  it('shares the per-user command limit across allowed groups', async () => {
    const adapter = new FakeWhatsAppAdapter();
    const bot = createBot({ adapter, members: new InMemoryMemberRepository(), ledger: new InMemoryXpLedger(), audit: new InMemoryAuditLog(), clock: { now: () => 0 }, routes: new InMemoryGroupRouteRegistry(['a', 'b'].map(platformGroupId => ({ platformGroupId, allowedCommands: ['ping'] }))) });
    await bot.receive({ id: '1', groupId: 'a', senderId: 'synthetic-user', text: '/ping', fromMe: false });
    await bot.receive({ id: '2', groupId: 'b', senderId: 'synthetic-user', text: '/ping', fromMe: false });
    await bot.receive({ id: '3', groupId: 'b', senderId: 'another-synthetic-user', text: '/ping', fromMe: false });
    expect(adapter.sent).toEqual([{ groupId: 'a', text: 'pong' }, { groupId: 'b', text: 'pong' }]);
  });
  it('keeps an immutable append-only ledger; corrections are new entries', async () => {
    const ledger = new InMemoryXpLedger();
    const entry: XpTransaction = { id: 'a', memberId: 'm', amount: 50, occurredAt: 0, source: 'manual', sourceId: 'evidence-a', actorId: 'synthetic-admin', reason: 'Synthetic MLBB points' };
    expect(await ledger.append(entry)).toBe(true);
    expect(await ledger.append({ ...entry, id: 'duplicate-source' })).toBe(false);
    expect(await ledger.append({ ...entry, sourceId: 'other' })).toBe(false);
    const snapshot = await ledger.list('m');
    expect(() => Object.assign(snapshot[0]!, { amount: 999 })).toThrow();
    expect('setBalance' in ledger).toBe(false);
    await ledger.append({ ...entry, id: 'b', sourceId: 'correction-b', amount: -10, reason: 'Correct synthetic award' });
    expect(xpBalance(await ledger.list('m'))).toBe(40);
    expect(snapshot).toHaveLength(1);
    expect(await ledger.list('m')).toHaveLength(2);
  });
});
