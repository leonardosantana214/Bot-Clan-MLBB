import { describe, expect, it, vi } from 'vitest';
import { InMemoryAuditLog } from '@aerobot/core';
import {
  CommandLog, ControlClient, ControlClientError, ControlServer, InMemoryTransport, InvalidTransitionError, LoginThrottle,
  SessionManager, canTransition, hashPassword, isValidPasswordHash, verifyPassword, SCHEMA_VERSION,
  type GroupRoute, type HostControlPort, type HostState
} from '../src/index.js';

const FAST = { N: 1024 };
const PASSWORD = 'correct horse battery staple';
const WRONG = 'definitely-the-wrong-one';

class FakeClock { constructor(public t = 1_700_000_000_000) {} now(): number { return this.t; } advance(ms: number): void { this.t += ms; } }

function makeHost() {
  const state: HostState = {
    status: 'online', instanceAlias: 'NODE-TEST', lastConnectedAt: 'x', uptimeLabel: '1d', pendingQueueCount: 0,
    processedPerMinute: 1, responsesPaused: false, maintenanceMode: false
  };
  const group: GroupRoute = {
    id: 'g1', name: 'CHAT', routeTag: 'rota://chat', memberCount: 3, dailyMessages: 4,
    modules: { welcome: true, xpSystem: true, mlbbCommands: true, antiSpam: true, scrimAlerts: true }
  };
  const calls = { setResponsesPaused: 0, requestExport: 0 };
  const port: HostControlPort = {
    getOverview: async () => ({ totalMembers: 3, activeToday: 1, messagesToday: 4, hostStatus: 'online', clanName: 'TEST', seasonLabel: 'S1' }),
    getHostState: async () => ({ ...state }),
    setResponsesPaused: async paused => { calls.setResponsesPaused++; state.responsesPaused = paused; return { ...state }; },
    setMaintenanceMode: async enabled => { state.maintenanceMode = enabled; return { ...state }; },
    listGroups: async () => [{ ...group }],
    setGroupModules: async (id, patch) => { if (id !== 'g1') return undefined; group.modules = { ...group.modules, ...patch } as GroupRoute['modules']; return { ...group }; },
    getRanking: async () => [{ rank: 1, memberId: 'm1', nickname: 'Alpha', level: 2, xp: 50, messagesSent: 9 }],
    requestExport: async dataset => { calls.requestExport++; return { dataset, fileName: `${dataset}.csv`, rowCount: 1, generatedAt: 'now', previewCsv: 'a,b' }; }
  };
  return { port, state, calls };
}

let cachedHash: string | undefined;
async function setup(extra: { host?: HostControlPort; logger?: { warn: (e: string, f?: Record<string, string | number>) => void } } = {}) {
  cachedHash ??= await hashPassword(PASSWORD, FAST);
  const clock = new FakeClock();
  const audit = new InMemoryAuditLog();
  const h = makeHost();
  const server = new ControlServer({
    adminPasswordHash: cachedHash, host: extra.host ?? h.port, audit, clock,
    ...(extra.logger ? { logger: extra.logger } : {})
  });
  const transport = new InMemoryTransport(server);
  const client = new ControlClient(transport, { clock, origin: 'ctl-1' });
  return { clock, audit, server, transport, client, ...h };
}
const baseReq = (clock: FakeClock, over: Record<string, unknown>) => ({
  schemaVersion: SCHEMA_VERSION, requestId: `req-${Math.random().toString(36).slice(2, 10)}`, expiresAt: clock.now() + 30_000, payload: {}, ...over
});

describe('password hashing', () => {
  it('hashes with salt, self-describing format, and verifies', async () => {
    const a = await hashPassword(PASSWORD, FAST); const b = await hashPassword(PASSWORD, FAST);
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$v=1$N=1024,r=8,p=1$')).toBe(true);
    expect(a).not.toContain(PASSWORD);
    expect(isValidPasswordHash(a)).toBe(true);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
    expect(await verifyPassword(WRONG, a)).toBe(false);
  });
  it('honors configurable params and rejects malformed input without throwing', async () => {
    const h = await hashPassword(PASSWORD, { N: 2048, r: 8, p: 2, saltLength: 24, keyLength: 48 });
    expect(h).toContain('N=2048,r=8,p=2');
    expect(await verifyPassword(PASSWORD, h)).toBe(true);
    for (const bad of ['', 'plain', 'scrypt$v=1$N=1,r=1,p=1$aa$bb', h.replace('N=2048', 'N=999999999')]) expect(await verifyPassword(PASSWORD, bad)).toBe(false);
    await expect(hashPassword('short', FAST)).rejects.toThrow();
    await expect(hashPassword(PASSWORD, { N: 1000 })).rejects.toThrow();
  });
  it('server refuses a non-hash (plaintext) configuration', async () => {
    expect(() => new ControlServer({ adminPasswordHash: PASSWORD, host: makeHost().port, audit: new InMemoryAuditLog(), clock: new FakeClock() })).toThrow();
  });
});

describe('login throttle', () => {
  it('limita scrypt globalmente mesmo com rotação de origens', async () => {
    const s = await setup();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => s.server.handle(baseReq(s.clock, { type: 'login', origin: `parallel-${i}`, payload: { password: WRONG } })))) as { error: { code: string } }[];
    expect(results.filter(r => r.error.code === 'invalid_credentials')).toHaveLength(8);
    expect(results.filter(r => r.error.code === 'rate_limited')).toHaveLength(4);
  });
  it('reserva o orçamento antes de oito logins paralelos e rejeita login expirado', async () => {
    const s = await setup();
    const expired = await s.server.handle(baseReq(s.clock, { type: 'login', expiresAt: s.clock.now(), payload: { password: PASSWORD } })) as { error: { code: string } };
    expect(expired.error.code).toBe('expired');
    const results = await Promise.all(Array.from({ length: 8 }, () => s.server.handle(baseReq(s.clock, { type: 'login', origin: 'parallel', payload: { password: WRONG } })))) as { error: { code: string } }[];
    expect(results.filter(r => r.error.code === 'invalid_credentials')).toHaveLength(5);
    expect(results.filter(r => r.error.code === 'rate_limited')).toHaveLength(3);
    expect(s.server.activeSessions).toBe(0);
  });
  it('locks progressively and resets after success/forget window', () => {
    const c = new FakeClock(); const t = new LoginThrottle(() => c.now());
    for (let i = 0; i < 4; i++) t.recordFailure('o');
    expect(t.retryAfterMs('o')).toBe(0);
    t.recordFailure('o'); // 5th: first lock = 30s
    expect(t.retryAfterMs('o')).toBe(30_000);
    c.advance(30_000); expect(t.retryAfterMs('o')).toBe(0);
    t.recordFailure('o'); expect(t.retryAfterMs('o')).toBe(60_000);
    c.advance(60_000); t.recordFailure('o'); expect(t.retryAfterMs('o')).toBe(120_000);
    for (let i = 0; i < 20; i++) { c.advance(1_000_000); t.recordFailure('o'); }
    expect(t.retryAfterMs('o')).toBeLessThanOrEqual(15 * 60_000);
    expect(t.retryAfterMs('other')).toBe(0);
    t.recordSuccess('o'); expect(t.retryAfterMs('o')).toBe(0);
  });
  it('server returns rate_limited after repeated failures, even with the right password, until the lock ends', async () => {
    const s = await setup();
    const login = (pw: string) => s.client.login(pw);
    for (let i = 0; i < 5; i++) await expect(login(WRONG)).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(login(PASSWORD)).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 30_000 });
    s.clock.advance(30_001);
    await expect(login(PASSWORD)).resolves.toBeTruthy();
  });
  it('global throttle blocks origin rotation', async () => {
    const s = await setup();
    for (let i = 0; i < 30; i++) {
      await s.server.handle(baseReq(s.clock, { type: 'login', origin: `o-${i}`, payload: { password: WRONG } }));
    }
    const r = await s.server.handle(baseReq(s.clock, { type: 'login', origin: 'fresh', payload: { password: PASSWORD } })) as { error: { code: string } };
    expect(r.error.code).toBe('rate_limited');
  });
});

describe('sessions', () => {
  it('stores only token hashes, expires, renews with limit, revokes', () => {
    const c = new FakeClock(); const m = new SessionManager(() => c.now(), { maxRenewals: 2 });
    const { token, session } = m.create();
    expect(Buffer.from(token, 'base64url').length).toBe(32);
    expect(JSON.stringify([...(m as unknown as { sessions: Map<string, unknown> }).sessions.keys()])).not.toContain(token);
    expect(m.validate(token)).toBe(session);
    expect(session.expiresAt - c.now()).toBe(12 * 3600_000);
    c.advance(11 * 3600_000);
    expect((m.renew(token) as { renewals: number }).renewals).toBe(1);
    expect(m.renew(token)).not.toBe('limit');
    expect(m.renew(token)).toBe('limit');
    c.advance(48 * 3600_000); expect(m.validate(token)).toBeUndefined();
    const b = m.create(); expect(m.revoke(b.token)).toBe(true); expect(m.validate(b.token)).toBeUndefined();
    const x = m.create(); const y = m.create(); expect(m.revokeAll()).toBe(2);
    expect(m.validate(x.token)).toBeUndefined(); expect(m.validate(y.token)).toBeUndefined();
  });
  it('server: expired session -> unauthenticated + client callback; logout revokes; revoke-all kills other sessions', async () => {
    const s = await setup();
    const onExpired = vi.fn();
    const c1 = new ControlClient(s.transport, { clock: s.clock, onSessionExpired: onExpired });
    await c1.login(PASSWORD);
    await c1.getHostState();
    s.clock.advance(12 * 3600_000 + 1);
    await expect(c1.getHostState()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(c1.isLoggedIn).toBe(false);
    await expect(c1.getHostState()).rejects.toMatchObject({ code: 'not_logged_in' });

    await s.client.login(PASSWORD);
    const other = new ControlClient(s.transport, { clock: s.clock });
    await other.login(PASSWORD);
    await s.client.logout(true);
    await expect(other.getOverview()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(s.server.activeSessions).toBe(0);
  });
  it('renewSession extends and eventually hits the limit', async () => {
    const s = await setup();
    await s.client.login(PASSWORD);
    for (let i = 0; i < 3; i++) await s.client.renewSession();
    await expect(s.client.renewSession()).rejects.toMatchObject({ code: 'renewal_limit' });
  });
});

describe('request validation and auth', () => {
  it('rejects requests without token or with a bogus token', async () => {
    const s = await setup();
    for (const type of ['getOverview', 'getHostState', 'listGroups']) {
      const r = await s.server.handle(baseReq(s.clock, { type })) as { ok: boolean; error: { code: string } };
      expect(r.ok).toBe(false); expect(r.error.code).toBe('unauthenticated');
    }
    const r2 = await s.server.handle(baseReq(s.clock, { type: 'getOverview', token: 'nope' })) as { error: { code: string } };
    expect(r2.error.code).toBe('unauthenticated');
    const r3 = await s.server.handle(baseReq(s.clock, { type: 'setResponsesPaused', idempotencyKey: 'key-12345', payload: { paused: true } })) as { error: { code: string } };
    expect(r3.error.code).toBe('unauthenticated');
    expect(s.state.responsesPaused).toBe(false);
  });
  it('rejects invalid schema, missing idempotencyKey, unknown fields and unsupported versions', async () => {
    const s = await setup();
    await s.client.login(PASSWORD);
    const token = (await s.server.handle(baseReq(s.clock, { type: 'login', payload: { password: PASSWORD } })) as { data: { token: string } }).data.token;
    const code = async (over: Record<string, unknown>) => ((await s.server.handle(baseReq(s.clock, { token, ...over }))) as { error: { code: string } }).error.code;
    expect(await code({ type: 'setResponsesPaused', payload: { paused: true } })).toBe('invalid_request'); // no idempotencyKey
    expect(await code({ type: 'setResponsesPaused', idempotencyKey: 'key-12345', payload: { paused: 'yes' } })).toBe('invalid_request');
    expect(await code({ type: 'getRanking', payload: { period: 'yearly' } })).toBe('invalid_request');
    expect(await code({ type: 'getOverview', payload: { extra: 1 } })).toBe('invalid_request');
    expect(await code({ type: 'setGroupModules', idempotencyKey: 'key-12345', payload: { groupId: 'g1', modules: {} } })).toBe('invalid_request');
    expect(await code({ type: 'nope' })).toBe('invalid_request');
    expect(await code({ type: 'getOverview', schemaVersion: 99 })).toBe('unsupported_version');
    expect(((await s.server.handle('garbage')) as { error: { code: string } }).error.code).toBe('invalid_request');
    expect(((await s.server.handle(null)) as { error: { code: string } }).error.code).toBe('invalid_request');
  });
  it('rejects expired read requests', async () => {
    const s = await setup();
    await s.client.login(PASSWORD);
    const login = await s.server.handle(baseReq(s.clock, { type: 'login', payload: { password: PASSWORD } })) as { data: { token: string } };
    const r = await s.server.handle(baseReq(s.clock, { type: 'getOverview', token: login.data.token, expiresAt: s.clock.now() - 1 })) as { error: { code: string } };
    expect(r.error.code).toBe('expired');
  });
});

describe('commands: idempotency, expiry, state machine', () => {
  it('não reexecuta uma chave após poda do histórico', async () => {
    const s = await setup(); await s.client.login(PASSWORD);
    await s.client.setResponsesPaused(true, { idempotencyKey: 'pruned-key' });
    for (let i = 0; i < 2001; i++) await s.client.setResponsesPaused(false, { idempotencyKey: `fill-key-${i}` });
    const calls = s.calls.setResponsesPaused;
    await expect(s.client.setResponsesPaused(true, { idempotencyKey: 'pruned-key' })).rejects.toMatchObject({ code: 'expired' });
    await expect(s.client.setResponsesPaused(false, { idempotencyKey: 'pruned-key' })).rejects.toMatchObject({ code: 'conflict' });
    expect(s.calls.setResponsesPaused).toBe(calls);
  });
  it('preserva a chave da intenção após perder a resposta de uma mutação', async () => {
    let effects = 0; let lose = true;
    const s = await setup({ host: { ...makeHost().port, leadershipAction: async () => { effects++; return { schemaVersion: 1, rows: [{ saved: true }], unavailable: [] }; } } });
    const client = new ControlClient({ send: async request => {
      const response = await s.transport.send(request);
      if ((request as { type: string }).type === 'leadershipAction' && lose) { lose = false; throw new Error('synthetic transport failure'); }
      return response;
    } }, { clock: s.clock });
    await client.login(PASSWORD);
    const action = { action: 'scoutNote' as const, confirm: true as const, candidateId: 'synthetic', reason: 'Nota de teste' };
    await expect(client.leadershipAction(action)).rejects.toMatchObject({ code: 'transport' });
    await client.leadershipAction(action);
    expect(effects).toBe(1);
    // A later successful new intent may intentionally append another note.
    await client.leadershipAction(action); expect(effects).toBe(2);
  });
  it('replays the previous result without re-executing', async () => {
    const s = await setup();
    await s.client.login(PASSWORD);
    const a = await s.client.setResponsesPaused(true, { idempotencyKey: 'idem-0001' });
    const b = await s.client.setResponsesPaused(true, { idempotencyKey: 'idem-0001' });
    expect(b).toEqual(a);
    expect(s.calls.setResponsesPaused).toBe(1);
    const sends = s.transport.wire.filter(w => w.includes('idem-0001'));
    expect(sends).toHaveLength(2);
    const ex1 = await s.client.requestExport('xp_ranking', { idempotencyKey: 'idem-0002' });
    const ex2 = await s.client.requestExport('xp_ranking', { idempotencyKey: 'idem-0002' });
    expect(ex2).toEqual(ex1); expect(s.calls.requestExport).toBe(1);
    // audit not duplicated by replay
    expect(s.audit.list().filter(e => e.action.startsWith('control.setResponsesPaused'))).toHaveLength(1);
  });
  it('flags replay in the envelope and rejects key reuse with different content', async () => {
    const s = await setup();
    const { data } = await s.server.handle(baseReq(s.clock, { type: 'login', payload: { password: PASSWORD } })) as { data: { token: string } };
    const req = (paused: boolean) => baseReq(s.clock, { type: 'setResponsesPaused', token: data.token, idempotencyKey: 'idem-0003', payload: { paused } });
    const r1 = await s.server.handle(req(true)) as { replayed?: boolean; command: { state: string } };
    const r2 = await s.server.handle(req(true)) as { replayed?: boolean; command: { state: string } };
    const r3 = await s.server.handle(req(false)) as { error: { code: string } };
    expect(r1.replayed).toBeUndefined(); expect(r1.command.state).toBe('concluido');
    expect(r2.replayed).toBe(true); expect(r2.command.state).toBe('concluido');
    expect(r3.error.code).toBe('conflict');
    expect(s.state.responsesPaused).toBe(true);
  });
  it('concurrent duplicates execute once', async () => {
    const s = await setup();
    await s.client.login(PASSWORD);
    await Promise.all([1, 2, 3].map(() => s.client.setMaintenanceMode(true, { idempotencyKey: 'idem-0004' })));
    expect(s.state.maintenanceMode).toBe(true);
    expect(s.audit.list().filter(e => e.action.startsWith('control.setMaintenanceMode'))).toHaveLength(1);
  });
  it('expired commands never execute and are marked expirou', async () => {
    const s = await setup();
    const { data } = await s.server.handle(baseReq(s.clock, { type: 'login', payload: { password: PASSWORD } })) as { data: { token: string } };
    const r = await s.server.handle(baseReq(s.clock, {
      type: 'setResponsesPaused', token: data.token, idempotencyKey: 'idem-0005', payload: { paused: true }, expiresAt: s.clock.now() - 5
    })) as { error: { code: string }; command: { state: string } };
    expect(r.error.code).toBe('expired'); expect(r.command.state).toBe('expirou');
    expect(s.calls.setResponsesPaused).toBe(0); expect(s.state.responsesPaused).toBe(false);
    // a fresh retry with the same key and a valid deadline can run
    const ok = await s.server.handle(baseReq(s.clock, { type: 'setResponsesPaused', token: data.token, idempotencyKey: 'idem-0005', payload: { paused: true } })) as { ok: boolean };
    expect(ok.ok).toBe(true); expect(s.calls.setResponsesPaused).toBe(1);
  });
  it('state machine: valid path, invalid transitions, only the Host concludes', () => {
    const c = new FakeClock(); const log = new CommandLog(() => c.now());
    const mk = () => log.create({ type: 't', sessionId: 's', idempotencyKey: 'k', fingerprint: 'f', expiresAt: c.now() + 1000 });
    const a = mk();
    expect(a.state).toBe('pendente');
    expect(() => log.transition(a.id, 'concluido', 'host')).toThrow(InvalidTransitionError);
    expect(() => log.transition(a.id, 'recebido', 'controller')).toThrow(InvalidTransitionError);
    log.transition(a.id, 'recebido', 'host');
    log.transition(a.id, 'em_execucao', 'host');
    expect(() => log.transition(a.id, 'concluido', 'controller')).toThrow(InvalidTransitionError);
    expect(() => log.transition(a.id, 'cancelado', 'controller')).toThrow(InvalidTransitionError); // running: not cancellable
    expect(log.transition(a.id, 'concluido', 'host').state).toBe('concluido');
    for (const to of ['pendente', 'recebido', 'em_execucao', 'falhou', 'expirou', 'cancelado'] as const) expect(canTransition('concluido', to, 'host')).toBe(false);
    const b = mk(); expect(log.transition(b.id, 'cancelado', 'controller').state).toBe('cancelado');
    const d = mk(); log.transition(d.id, 'recebido', 'host'); c.advance(1000);
    expect(() => log.transition(d.id, 'em_execucao', 'host')).toThrow(InvalidTransitionError); // expired never runs
    expect(log.expireIfDue(d.id)).toBe(true); expect(log.get(d.id)?.state).toBe('expirou');
  });
  it('host failures become falhou with a generic error and no leak', async () => {
    const h = makeHost();
    const port: HostControlPort = { ...h.port, setMaintenanceMode: async () => { throw new Error('db password=hunter2 leaked'); } };
    const s = await setup({ host: port });
    await s.client.login(PASSWORD);
    const err = await s.client.setMaintenanceMode(true).catch((e: unknown) => e) as ControlClientError;
    expect(err.code).toBe('internal');
    expect(JSON.stringify(err.message)).not.toContain('hunter2');
    expect(s.server.commandLog.list().some(c => c.state === 'falhou')).toBe(true);
    expect(s.audit.list().some(e => e.action.endsWith('.failed'))).toBe(true);
  });
  it('fails closed when the audit log cannot be written', async () => {
    const s = await setup();
    await s.client.login(PASSWORD);
    vi.spyOn(s.audit, 'record').mockRejectedValue(new Error('disk'));
    await expect(s.client.setResponsesPaused(true)).rejects.toMatchObject({ code: 'internal' });
    expect(s.calls.setResponsesPaused).toBe(0);
  });
});

describe('audit', () => {
  it('records admin actions with ADM:<short session id>', async () => {
    const s = await setup();
    const { sessionId } = await s.client.login(PASSWORD);
    await s.client.setResponsesPaused(true);
    await s.client.setGroupModules('g1', { welcome: false });
    await s.client.requestExport('clan_members');
    await s.client.getOverview();
    await s.client.logout();
    const ev = s.audit.list();
    expect(ev.map(e => e.action)).toEqual([
      'control.login', 'control.setResponsesPaused:on', 'control.setGroupModules:welcome=off', 'control.requestExport', 'control.logout'
    ]);
    expect(new Set(ev.map(e => e.actorId))).toEqual(new Set([`ADM:${sessionId}`]));
    expect(sessionId).toMatch(/^[0-9a-f]{8}$/);
    expect(ev[2]?.subjectId).toBe('g1'); expect(ev[3]?.subjectId).toBe('clan_members');
  });
  it('records failed logins without the password', async () => {
    const s = await setup();
    await s.client.login(WRONG).catch(() => undefined);
    const ev = s.audit.list();
    expect(ev[0]).toMatchObject({ action: 'control.login.failed', actorId: 'ADM:-' });
    expect(JSON.stringify(ev)).not.toContain(WRONG);
  });
});

describe('no secrets leak', () => {
  it('logs, errors, audit and responses never contain password, token or hash', async () => {
    const warn = vi.fn();
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(k => vi.spyOn(console, k).mockImplementation(() => undefined));
    const s = await setup({ logger: { warn } });
    for (let i = 0; i < 6; i++) await s.client.login(WRONG).catch(() => undefined);
    const msgs: unknown[] = [];
    const e1 = await s.client.login(PASSWORD).catch((e: unknown) => e); msgs.push(e1);
    s.clock.advance(15 * 60_000);
    await s.client.login(PASSWORD);
    await s.client.getHostState();
    const tokenAfter = s.transport.wire.map(w => JSON.parse(w) as { token?: string }).find(w => w.token)?.token;
    await s.client.setMaintenanceMode(true);
    const bad = await s.server.handle({ type: 'setResponsesPaused', payload: { paused: PASSWORD } });
    msgs.push(bad);
    s.clock.advance(13 * 3600_000);
    msgs.push(await s.client.getHostState().catch((e: unknown) => e));
    const hash = cachedHash as string;
    const blob = JSON.stringify([warn.mock.calls, msgs.map(m => (m instanceof Error ? m.message : m)), s.audit.list(), spies.map(sp => sp.mock.calls)]);
    for (const secret of [PASSWORD, WRONG, hash, ...(tokenAfter ? [tokenAfter] : [])]) expect(blob).not.toContain(secret);
    expect(tokenAfter).toBeTruthy();
    spies.forEach(sp => sp.mockRestore());
  });
  it('login errors are identical regardless of why it failed', async () => {
    const s = await setup();
    const a = await s.server.handle(baseReq(s.clock, { requestId: 'same-id-1', type: 'login', origin: 'a', payload: { password: WRONG } }));
    const b = await s.server.handle(baseReq(s.clock, { requestId: 'same-id-1', type: 'login', origin: 'b', payload: { password: 'x' } }));
    expect(a).toEqual(b);
  });
});

describe('end to end client <-> server', () => {
  it('full admin flow through InMemoryTransport', async () => {
    const s = await setup();
    await expect(s.client.getOverview()).rejects.toMatchObject({ code: 'not_logged_in' });
    await s.client.login(PASSWORD);
    expect(s.client.isLoggedIn).toBe(true);
    expect((await s.client.getOverview()).clanName).toBe('TEST');
    expect((await s.client.getHostState()).responsesPaused).toBe(false);
    expect((await s.client.setResponsesPaused(true)).responsesPaused).toBe(true);
    expect((await s.client.setMaintenanceMode(true)).maintenanceMode).toBe(true);
    expect((await s.client.getHostState()).responsesPaused).toBe(true);
    const groups = await s.client.listGroups();
    expect(groups[0]?.modules.welcome).toBe(true);
    expect((await s.client.setGroupModules('g1', { welcome: false, antiSpam: false })).modules).toMatchObject({ welcome: false, antiSpam: false, xpSystem: true });
    await expect(s.client.setGroupModules('missing', { welcome: true })).rejects.toMatchObject({ code: 'not_found' });
    expect((await s.client.getRanking('weekly'))[0]?.nickname).toBe('Alpha');
    expect((await s.client.requestExport('xp_ranking')).fileName).toBe('xp_ranking.csv');
    await s.client.logout();
    expect(s.client.isLoggedIn).toBe(false);
    expect(s.server.activeSessions).toBe(0);
  });
  it('maps transport failures and malformed responses', async () => {
    const down = new ControlClient({ send: async () => { throw new Error('offline'); } });
    await expect(down.login(PASSWORD)).rejects.toMatchObject({ code: 'transport' });
    const junk = new ControlClient({ send: async () => ({ hello: 1 }) });
    await expect(junk.login(PASSWORD)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
