import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { FakeWhatsAppAdapter, InMemoryAuditLog, InMemoryMemberRepository, type CommandContext, type CommandDefinition, type IncomingMessage, type Member, type WhatsAppAdapter } from '@aerobot/core';
import { InMemoryCommunityStore, SqliteCommunityStore, createCommunity, parseCommunityConfig, type CommunityStore } from '../src/index.js';

const ADMIN = 'admin-group';
const CHAT1 = 'chat-1';
const CHAT2 = 'chat-2';
const ANA = '5511912345678@s.whatsapp.net';
const BETO = '5511987654321@s.whatsapp.net';
const STRANGER = '5511955550000@s.whatsapp.net';
const MIN = 60_000;

class TestClock { t = 1_700_000_000_000; now(): number { return this.t; } advance(ms: number): void { this.t += ms; } }
class FlakyAdapter implements WhatsAppAdapter {
  sent: { groupId: string; text: string }[] = []; failures = 0;
  async sendMessage(groupId: string, text: string): Promise<void> {
    if (this.failures > 0) { this.failures--; throw new Error('network down'); }
    this.sent.push({ groupId, text });
  }
}

const stores: [string, () => CommunityStore][] = [
  ['memory', () => new InMemoryCommunityStore()],
  ['sqlite', () => new SqliteCommunityStore(new DatabaseSync(':memory:'))]
];

function member(id: string, name: string, platformUserId: string): Member {
  return { id, name, identities: [{ platformUserId }], status: 'active', registeredAt: 0 };
}

async function setup(makeStore: () => CommunityStore, overrides: Record<string, unknown> = {}) {
  const clock = new TestClock();
  const adapter = new FlakyAdapter();
  const members = new InMemoryMemberRepository();
  await members.register(member('aero:ana', 'Ana', ANA));
  await members.register(member('aero:beto', 'Beto', BETO));
  let n = 0;
  const store = makeStore();
  const community = createCommunity({
    config: { adminGroupId: ADMIN, chatGroupIds: [CHAT1, CHAT2], groupLabels: { [CHAT1]: 'Chat 1', [CHAT2]: 'Chat 2', [ADMIN]: 'Admin' }, ...overrides },
    store, adapter, members, clock, newId: () => `id-${++n}`
  });
  const msg = (text: string, senderId = ANA, groupId = CHAT1, id = `m${++n}`): IncomingMessage => ({ id, groupId, senderId, text, fromMe: false });
  return { clock, adapter, members, store, community, msg };
}

function ctx(env: Awaited<ReturnType<typeof setup>>, message: IncomingMessage): CommandContext {
  return { message, members: env.members, ledger: { append: async () => true, list: async () => [] }, clock: env.clock, audit: new InMemoryAuditLog(), levelFormula: { baseXp: 100, exponent: 2 } };
}
async function run(env: Awaited<ReturnType<typeof setup>>, commands: readonly CommandDefinition[], message: IncomingMessage): Promise<string> {
  const [token, ...args] = message.text.split(/\s+/u);
  const command = commands.find(c => c.name === token!.slice(1))!;
  const parsed = command.input.safeParse(args);
  if (!parsed.success) return 'Argumentos inválidos. Use /ajuda.';
  return command.handle(ctx(env, message), parsed.data);
}

describe.each(stores)('community (%s store)', (_name, makeStore) => {
  describe('membership', () => {
    it('records append-only events with origin and time, keeps membership state', async () => {
      const env = await setup(makeStore);
      await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'join' });
      env.clock.advance(1000);
      await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'leave' });
      const events = await env.store.listMembershipEvents({ participantId: ANA });
      expect(events.map(e => [e.action, e.groupId, e.origin, e.memberId])).toEqual([['join', CHAT1, 'whatsapp', 'aero:ana'], ['leave', CHAT1, 'whatsapp', 'aero:ana']]);
      expect(events[1]!.at - events[0]!.at).toBe(1000);
      expect(await env.store.appendMembershipEvent(events[0]!)).toBe(false);
      expect((await env.store.getPresence(ANA)).map(p => p.state)).toEqual(['left']);
    });

    it('ignores groups not visible to the bot', async () => {
      const env = await setup(makeStore);
      const result = await env.community.membership.onMembershipChange({ groupId: 'other', participantId: ANA, action: 'leave' });
      expect(result.recorded).toBe(false);
      expect(await env.store.listMembershipEvents()).toHaveLength(0);
    });

    it('leaving one group is not leaving the community; no case, member untouched', async () => {
      const env = await setup(makeStore);
      await env.community.membership.observePresence(CHAT2, [ANA]);
      await env.community.membership.observePresence(ADMIN, [ANA]);
      const r = await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'leave' });
      expect(r.reviewCaseOpened).toBe(false);
      expect(await env.store.listReviewCases()).toHaveLength(0);
      expect((await env.members.findByIdentity(ANA))?.status).toBe('active');
    });

    it('opens only a review case when ALL visible groups show a leave, without changing status', async () => {
      const env = await setup(makeStore);
      const m = env.community.membership;
      expect((await m.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'leave' })).reviewCaseOpened).toBe(false);
      expect((await m.onMembershipChange({ groupId: CHAT2, participantId: ANA, action: 'leave' })).reviewCaseOpened).toBe(false);
      expect((await m.onMembershipChange({ groupId: ADMIN, participantId: ANA, action: 'leave' })).reviewCaseOpened).toBe(true);
      const cases = await env.store.listReviewCases('open');
      expect(cases).toHaveLength(1);
      expect(cases[0]!.memberId).toBe('aero:ana');
      expect((await env.members.findByIdentity(ANA))?.status).toBe('active');
      // A second leave does not duplicate the open case.
      expect((await m.onMembershipChange({ groupId: ADMIN, participantId: ANA, action: 'leave' })).reviewCaseOpened).toBe(false);
      expect(await env.store.listReviewCases('open')).toHaveLength(1);
      expect(await env.store.resolveReviewCase(cases[0]!.id, env.clock.now(), 'aero:beto')).toBe(true);
      expect(await env.store.listReviewCases('open')).toHaveLength(0);
    });

    it('unknown participant joining yields a pending-registration notification and no case', async () => {
      const env = await setup(makeStore);
      const r = await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: STRANGER, action: 'join' });
      expect(r.pendingRegistration).toBe(true);
      expect((await env.store.listMembershipEvents())[0]!.pendingRegistration).toBe(true);
      env.clock.advance(10 * MIN);
      await env.community.tick();
      const texts = env.adapter.sent.map(s => s.text).join('\n');
      expect(texts).toContain('Cadastros pendentes');
      expect(texts).not.toContain('5511955550000');
    });
  });

  describe('notifications', () => {
    it('aggregates events of the same type in one admin message, only to the admin group', async () => {
      const env = await setup(makeStore);
      await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'join' });
      await env.community.membership.onMembershipChange({ groupId: CHAT2, participantId: BETO, action: 'leave' });
      await env.community.tick();
      expect(env.adapter.sent).toHaveLength(0); // window not elapsed
      env.clock.advance(10 * MIN);
      await env.community.tick();
      expect(env.adapter.sent).toHaveLength(1);
      expect(env.adapter.sent[0]!.groupId).toBe(ADMIN);
      expect(env.adapter.sent[0]!.text).toContain('Entradas/saídas nos últimos 10 min:');
      expect(env.adapter.sent[0]!.text).toContain('entrou: Ana em Chat 1');
      expect(env.adapter.sent[0]!.text).toContain('saiu: Beto em Chat 2');
      expect((await env.store.listNotifications('confirmed'))).toHaveLength(1);
    });

    it('is idempotent per (event, destination)', async () => {
      const env = await setup(makeStore);
      const event = { id: 'evt-1', type: 'membership' as const, at: 1, line: 'x' };
      await env.community.notifications.notify(event);
      await env.community.notifications.notify(event);
      env.clock.advance(10 * MIN);
      await env.community.tick();
      expect(env.adapter.sent[0]!.text.match(/^- /gmu)).toHaveLength(1);
      await env.community.notifications.notify(event);
      env.clock.advance(10 * MIN);
      await env.community.tick();
      expect(env.adapter.sent).toHaveLength(1);
    });

    it('caps listed lines and summarises the rest', async () => {
      const env = await setup(makeStore, { notifications: { maxLines: 3 } });
      for (let i = 0; i < 7; i++) await env.community.notifications.notify({ id: `e${i}`, type: 'membership', at: 1, line: `linha ${i}` });
      env.clock.advance(10 * MIN);
      await env.community.tick();
      expect(env.adapter.sent[0]!.text).toContain('... e mais 4');
    });

    it('retries with limited attempts, then marks failed', async () => {
      const env = await setup(makeStore, { notifications: { maxAttempts: 3, retryBaseMs: 1000 } });
      env.adapter.failures = 99;
      await env.community.notifications.notify({ id: 'e1', type: 'membership', at: 1, line: 'a' });
      env.clock.advance(10 * MIN);
      await env.community.tick();
      expect((await env.store.listNotifications('queued'))[0]!.attempts).toBe(1);
      await env.community.tick(); // backoff not elapsed
      expect((await env.store.listNotifications('queued'))[0]!.attempts).toBe(1);
      env.clock.advance(1000); await env.community.tick();
      env.clock.advance(2000); await env.community.tick();
      const failed = await env.store.listNotifications('failed');
      expect(failed).toHaveLength(1);
      expect(failed[0]!.attempts).toBe(3);
      expect(failed[0]!.lastError).toContain('network down');
      env.clock.advance(60_000); await env.community.tick();
      expect(env.adapter.sent).toHaveLength(0);
    });

    it('recovers when a retry succeeds', async () => {
      const env = await setup(makeStore, { notifications: { retryBaseMs: 1000 } });
      env.adapter.failures = 1;
      await env.community.notifications.notify({ id: 'e1', type: 'membership', at: 1, line: 'a' });
      env.clock.advance(10 * MIN); await env.community.tick();
      env.clock.advance(1000); await env.community.tick();
      expect(env.adapter.sent).toHaveLength(1);
      expect(await env.store.listNotifications('confirmed')).toHaveLength(1);
    });

    it('keeps sent state until confirm() when autoConfirm is off', async () => {
      const env = await setup(makeStore, { notifications: { autoConfirm: false } });
      await env.community.notifications.notify({ id: 'e1', type: 'membership', at: 1, line: 'a' });
      env.clock.advance(10 * MIN); await env.community.tick();
      const sent = await env.store.listNotifications('sent');
      expect(sent).toHaveLength(1);
      await env.community.notifications.confirm(sent[0]!.id);
      expect(await env.store.listNotifications('confirmed')).toHaveLength(1);
    });

    it('never targets a CHAT group (config rejects it; reports never reach chat)', async () => {
      expect(() => parseCommunityConfig({ adminGroupId: CHAT1, chatGroupIds: [CHAT1] })).toThrow();
      const env = await setup(makeStore);
      await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: STRANGER, action: 'join' });
      for (let i = 0; i < 12; i++) await env.community.moderation.onMessage(env.msg('mesma mensagem repetida aqui', ANA));
      env.clock.advance(10 * MIN); await env.community.tick();
      expect(env.adapter.sent.length).toBeGreaterThan(0);
      expect(env.adapter.sent.every(s => s.groupId === ADMIN)).toBe(true);
    });
  });

  describe('welcome', () => {
    it('is off by default', async () => {
      const env = await setup(makeStore);
      await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'join' });
      env.clock.advance(10 * MIN); await env.community.tick();
      expect(env.adapter.sent.some(s => s.groupId === CHAT1)).toBe(false);
    });

    it('rejects unknown placeholders and non-CHAT groups', () => {
      expect(() => parseCommunityConfig({ adminGroupId: ADMIN, chatGroupIds: [CHAT1], welcome: { [CHAT1]: { enabled: true, template: 'Oi {telefone}' } } })).toThrow();
      expect(() => parseCommunityConfig({ adminGroupId: ADMIN, chatGroupIds: [CHAT1], welcome: { [ADMIN]: { enabled: true } } })).toThrow();
    });

    it('aggregates bursts, rate limits, and never shows phone numbers', async () => {
      const env = await setup(makeStore, { welcome: { [CHAT1]: { enabled: true, windowMs: 5000, minIntervalMs: 60_000 } } });
      const m = env.community.membership;
      await m.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'join' });
      await m.onMembershipChange({ groupId: CHAT1, participantId: BETO, action: 'join' });
      await m.onMembershipChange({ groupId: CHAT1, participantId: STRANGER, action: 'join' });
      await env.community.welcome.tick();
      expect(env.adapter.sent).toHaveLength(0);
      env.clock.advance(5000);
      await env.community.welcome.tick();
      const welcomes = env.adapter.sent.filter(s => s.groupId === CHAT1);
      expect(welcomes).toHaveLength(1);
      expect(welcomes[0]!.text).toContain('Ana, Beto e mais 1');
      expect(welcomes[0]!.text).not.toMatch(/\d{6,}/u);
      // Another join soon after is held back until the minimum interval passes.
      await m.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'join' });
      env.clock.advance(10_000); await env.community.welcome.tick();
      expect(env.adapter.sent.filter(s => s.groupId === CHAT1)).toHaveLength(1);
      env.clock.advance(60_000); await env.community.welcome.tick();
      expect(env.adapter.sent.filter(s => s.groupId === CHAT1)).toHaveLength(2);
    });

    it('sanitizes names that look like phone numbers or contain mentions', async () => {
      const env = await setup(makeStore, { welcome: { [CHAT1]: { enabled: true, windowMs: 1000 } } });
      await env.members.register(member('aero:x', '+55 11 91234-5678 @todos', '999@s.whatsapp.net'));
      await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: '999@s.whatsapp.net', action: 'join' });
      env.clock.advance(1000); await env.community.welcome.tick();
      const text = env.adapter.sent.find(s => s.groupId === CHAT1)!.text;
      expect(text).not.toMatch(/\d{4,}/u);
      expect(text).not.toContain('@');
    });

    it('tolerates send failures', async () => {
      const env = await setup(makeStore, { welcome: { [CHAT1]: { enabled: true, windowMs: 1000 } } });
      await env.community.membership.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'join' });
      env.adapter.failures = 1;
      env.clock.advance(1000);
      await expect(env.community.welcome.tick()).resolves.toBeUndefined();
    });
  });

  describe('moderation', () => {
    it('flags flood without blocking or storing text', async () => {
      const env = await setup(makeStore, { moderation: { flood: { maxMessages: 5, windowMs: 10_000 } } });
      let flags = 0;
      for (let i = 0; i < 8; i++) { flags += (await env.community.moderation.onMessage(env.msg(`mensagem número ${i} diferente`))).length; env.clock.advance(100); }
      expect(flags).toBe(1); // cooldown prevents a flag per message
      const stored = await env.store.listFlags(CHAT1);
      expect(stored[0]!.kind).toBe('flood');
      expect(stored[0]!.memberId).toBe('aero:ana');
      expect(JSON.stringify(stored)).not.toContain('5511912345678');
      expect(JSON.stringify(stored)).not.toContain('diferente');
    });

    it('flags repeated messages but not short repeats like laughter', async () => {
      const env = await setup(makeStore);
      for (let i = 0; i < 6; i++) { expect(await env.community.moderation.onMessage(env.msg('kkkk'))).toHaveLength(0); env.clock.advance(3000); }
      const out: number[] = [];
      for (let i = 0; i < 3; i++) { out.push((await env.community.moderation.onMessage(env.msg('Entrem no meu canal agora'))).length); env.clock.advance(3000); }
      expect(out).toEqual([0, 0, 1]);
    });

    it('flags suspicious links (shorteners, invites) but not ordinary links or domains', async () => {
      const env = await setup(makeStore);
      const mod = env.community.moderation;
      expect(await mod.onMessage(env.msg('olha isso https://bit.ly/abc123'))).toHaveLength(1);
      env.clock.advance(MIN);
      expect(await mod.onMessage(env.msg('entra aí chat.whatsapp.com/XYZ'))).toHaveLength(1);
      env.clock.advance(MIN);
      expect(await mod.onMessage(env.msg('guia https://www.youtube.com/watch?v=1 e mobilelegends.com'))).toHaveLength(0);
      expect(await mod.onMessage(env.msg('abit.ly não é o mesmo domínio, versão 1.5 ok'))).toHaveLength(0);
    });

    it('does not flag normal conversation, other groups, or bot messages', async () => {
      const env = await setup(makeStore);
      const mod = env.community.moderation;
      const chat = ['bom dia pessoal', 'quem joga hoje à noite?', 'boa partida!', 'sim', 'vamos de rank', 'kkkkk', 'GG', 'bora', 'qual herói vocês acham melhor?', 'o patch novo nerfou o Layla'];
      for (const text of chat) { expect(await mod.onMessage(env.msg(text, ANA))).toHaveLength(0); env.clock.advance(4000); }
      for (let i = 0; i < 30; i++) expect(await mod.onMessage(env.msg('spam spam spam', ANA, ADMIN))).toHaveLength(0);
      expect(await mod.onMessage({ ...env.msg('https://bit.ly/x'), fromMe: true })).toHaveLength(0);
      expect(await env.store.listFlags()).toHaveLength(0);
    });

    it('notifies admins aggregated, referencing unknown senders only by hashed ref', async () => {
      const env = await setup(makeStore);
      await env.community.moderation.onMessage(env.msg('https://bit.ly/a', STRANGER));
      await env.community.moderation.onMessage(env.msg('https://tinyurl.com/b', BETO));
      env.clock.advance(10 * MIN); await env.community.tick();
      expect(env.adapter.sent).toHaveLength(1);
      const text = env.adapter.sent[0]!.text;
      expect(text).toContain('Alertas de moderação');
      expect(text).toContain('Beto');
      expect(text).toMatch(/ref [0-9a-f]{8}/u);
      expect(text).not.toContain('5511955550000');
    });
  });

  describe('warnings and commands', () => {
    const adminMsg = (env: Awaited<ReturnType<typeof setup>>, text: string) => env.msg(text, BETO, ADMIN);

    it('/advertir appends to the ledger; /advertencias lists; /minhasadvertencias shows own only', async () => {
      const env = await setup(makeStore);
      const { adminCommands, memberCommands } = env.community;
      const reply = await run(env, adminCommands, adminMsg(env, '/advertir aero:ana spam de links no chat'));
      expect(reply).toContain('Advertência registrada para Ana');
      env.clock.advance(1000);
      await run(env, adminCommands, adminMsg(env, '/advertir aero:ana flood'));
      const listing = await run(env, adminCommands, adminMsg(env, '/advertencias aero:ana'));
      expect(listing).toContain('Advertências de Ana (2)');
      expect(listing).toContain('spam de links no chat');
      expect(listing).toContain('por Beto');
      const own = await run(env, memberCommands, env.msg('/minhasadvertencias', ANA));
      expect(own).toContain('Consulte a liderança');
      expect(own).not.toContain('spam');
      expect(own).not.toContain(new Date(env.clock.now()).toISOString().slice(0, 10));
      expect(await run(env, memberCommands, env.msg('/minhasadvertencias', BETO))).toBe(own);
      expect((await env.store.listWarnings('aero:ana')).map(w => w.authorId)).toEqual(['aero:beto', 'aero:beto']);
    });

    it('admin commands refuse to run outside the admin group and with unknown targets', async () => {
      const env = await setup(makeStore);
      const { adminCommands } = env.community;
      expect(await run(env, adminCommands, env.msg('/advertir aero:ana teste', BETO, CHAT1))).toContain('restrito');
      expect(await run(env, adminCommands, env.msg('/advertencias aero:ana', BETO, CHAT1))).toContain('restrito');
      expect(await run(env, adminCommands, adminMsg(env, '/advertir aero:ninguem teste'))).toBe('Membro não encontrado.');
      expect(await run(env, adminCommands, adminMsg(env, '/advertir aero:ana'))).toContain('inválidos');
      expect(await env.store.listWarnings('aero:ana')).toHaveLength(0);
    });

    it('exports disjoint command sets with member commands free of admin names', async () => {
      const env = await setup(makeStore);
      expect(env.community.adminCommands.map(c => c.name)).toEqual(['advertir', 'advertencias']);
      expect(env.community.memberCommands.map(c => c.name)).toEqual(['minhasadvertencias']);
    });

    it('replies never expose WhatsApp identifiers or phone-like numbers', async () => {
      const env = await setup(makeStore);
      const { adminCommands, memberCommands } = env.community;
      const replies = [
        await run(env, adminCommands, adminMsg(env, '/advertir aero:ana ligou para 5511912345678 e xingou')),
        await run(env, adminCommands, adminMsg(env, '/advertencias aero:ana')),
        await run(env, memberCommands, env.msg('/minhasadvertencias', ANA))
      ].join('\n');
      expect(replies).not.toMatch(/\d{7,}/u);
      expect(replies).not.toContain('@s.whatsapp.net');
    });
  });
});

describe('contract parity between stores', () => {
  it('produces identical observable results for the same scenario', async () => {
    const results: string[] = [];
    for (const [, makeStore] of stores) {
      const env = await setup(makeStore);
      const m = env.community.membership;
      await m.onMembershipChange({ groupId: CHAT1, participantId: ANA, action: 'join' });
      await m.onMembershipChange({ groupId: CHAT1, participantId: STRANGER, action: 'join' });
      for (const g of [CHAT1, CHAT2, ADMIN]) await m.onMembershipChange({ groupId: g, participantId: BETO, action: 'leave' });
      await env.community.moderation.onMessage(env.msg('https://bit.ly/z'));
      await run(env, env.community.adminCommands, env.msg('/advertir aero:ana motivo', BETO, ADMIN));
      env.clock.advance(10 * MIN); await env.community.tick();
      results.push(JSON.stringify({
        events: (await env.store.listMembershipEvents()).map(e => [e.id, e.groupId, e.action, e.memberId, e.pendingRegistration]),
        cases: (await env.store.listReviewCases()).map(c => [c.id, c.status, c.memberId]),
        flags: (await env.store.listFlags()).map(f => [f.id, f.kind, f.detail]),
        warnings: (await env.store.listWarnings('aero:ana')).map(w => [w.reason, w.authorName]),
        notifications: (await env.store.listNotifications()).map(n => [n.type, n.state, n.text]),
        sent: env.adapter.sent
      }));
    }
    expect(results[0]).toBe(results[1]);
    expect(JSON.parse(results[0]!).cases).toHaveLength(1);
  });
});

describe('sqlite specifics', () => {
  it('blocks UPDATE and DELETE on ledgers via triggers', async () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteCommunityStore(db);
    await store.appendMembershipEvent({ id: 'e1', groupId: 'g', participantId: 'p', action: 'join', at: 1, origin: 'whatsapp', memberId: null, pendingRegistration: true });
    await store.appendFlag({ id: 'f1', kind: 'flood', groupId: 'g', senderRef: 'r', memberId: null, at: 1, detail: 'd' });
    await store.appendWarning({ id: 'w1', memberId: 'm', reason: 'r', authorId: 'a', authorName: 'A', at: 1 });
    for (const table of ['comm_membership_event', 'comm_moderation_flag', 'comm_warning']) {
      expect(() => db.exec(`UPDATE ${table} SET id = 'x'`)).toThrow(/append-only/u);
      expect(() => db.exec(`DELETE FROM ${table}`)).toThrow(/append-only/u);
    }
    expect(await store.listWarnings('m')).toHaveLength(1);
  });

  it('creates prefixed tables, own schema version, indexes; migration is idempotent; accepts a path', async () => {
    const db = new DatabaseSync(':memory:');
    new SqliteCommunityStore(db); new SqliteCommunityStore(db);
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => String(r.name));
    expect(names.filter(n => !n.startsWith('comm_') && n !== 'sqlite_sequence')).toEqual([]);
    expect(names).toContain('comm_schema_version');
    expect(Number(db.prepare('SELECT COUNT(*) AS c FROM sqlite_master WHERE type = \'index\' AND name LIKE \'comm_%\'').get()!.c)).toBeGreaterThanOrEqual(7);
    const byPath = new SqliteCommunityStore(':memory:');
    expect(await byPath.listWarnings('x')).toEqual([]);
    byPath.close();
  });

  it('rejects a newer schema version', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE comm_schema_version (version INTEGER PRIMARY KEY); INSERT INTO comm_schema_version VALUES (99)');
    expect(() => new SqliteCommunityStore(db)).toThrow(/Unsupported/u);
  });

  it('does not persist message text anywhere', async () => {
    const env = await setup(stores[1]![1]);
    await env.community.moderation.onMessage(env.msg('segredo-super-unico https://bit.ly/q'));
    env.clock.advance(10 * MIN); await env.community.tick();
    const dump = JSON.stringify([await env.store.listFlags(), await env.store.listNotifications()]);
    expect(dump).not.toContain('segredo-super-unico');
  });
});

describe('attach', () => {
  it('wires adapter events to services', async () => {
    const env = await setup(() => new InMemoryCommunityStore());
    const handlers: { m?: (e: never) => void; ms?: (e: never) => void } = {};
    const adapter = {
      sendMessage: async () => undefined, connect: async () => undefined, disconnect: async () => undefined,
      onMessage: (h: never) => { handlers.ms = h; return () => undefined; },
      onMembershipChange: (h: never) => { handlers.m = h; return () => undefined; },
      onConnectionState: () => () => undefined
    };
    const off = env.community.attach(adapter as never);
    (handlers.m as unknown as (e: unknown) => void)({ groupId: CHAT1, participantId: ANA, action: 'join' });
    await new Promise(r => setTimeout(r, 20));
    expect(await env.store.listMembershipEvents()).toHaveLength(1);
    off();
  });
});

void FakeWhatsAppAdapter;
