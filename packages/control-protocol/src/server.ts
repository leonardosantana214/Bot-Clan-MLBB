import type { WhatsAppConnection, WhatsAppGroup, GroupRoles, GroupRolesResult } from './schemas.js';
import { createHash } from 'node:crypto';
import type { AuditLog, Clock } from '@aerobot/core';
import { CommandLog, InvalidTransitionError, type CommandOutcome, type CommandRecord } from './command-state.js';
import { isValidPasswordHash, verifyPassword } from './password.js';
import {
  ControlRequestSchema, SCHEMA_VERSION, isMutating,
  type CommandState, type ControlErrorCode, type ControlRequest, type ExportDataset, type ExportReceipt,
  type GroupModulesPatch, type GroupRoute, type HostState, type MutatingType, type Overview, type RankEntry, type RankingPeriod
} from './schemas.js';
import { LoginThrottle, SessionManager, type Session, type SessionOptions, type ThrottleOptions } from './sessions.js';
import type { ControlMessageHandler } from './transport.js';

/** Port the Host implements. The Host stays the source of truth; the server only authenticates, validates and audits. */
export interface HostControlPort {
  getConnection?(): Promise<WhatsAppConnection>;
  startPairing?(): Promise<{ started: boolean }>;
  disconnectSession?(): Promise<{ disconnected: boolean }>;
  listWhatsAppGroups?(): Promise<WhatsAppGroup[]>;
  setGroupRoles?(roles: GroupRoles): Promise<GroupRolesResult>;
  getOverview(): Promise<Overview>;
  getHostState(): Promise<HostState>;
  setResponsesPaused(paused: boolean): Promise<HostState>;
  setMaintenanceMode(enabled: boolean): Promise<HostState>;
  listGroups(): Promise<readonly GroupRoute[]>;
  /** Resolve `undefined` when the group does not exist. */
  setGroupModules(groupId: string, modules: GroupModulesPatch): Promise<GroupRoute | undefined>;
  getRanking(period: RankingPeriod): Promise<readonly RankEntry[]>;
  requestExport(dataset: ExportDataset): Promise<ExportReceipt>;
}

/** Structured, secret-free diagnostics. Implementations must never receive passwords, tokens or hashes. */
export interface ControlLogger { warn(event: string, fields?: Readonly<Record<string, string | number>>): void }

export interface ControlServerOptions {
  /** Output of hashPassword(). Only the hash is ever held by the server. */
  adminPasswordHash: string;
  host: HostControlPort;
  audit: AuditLog;
  clock: Clock;
  session?: Partial<SessionOptions>;
  originThrottle?: Partial<ThrottleOptions>;
  /** Defense against origin rotation: counts failures across all origins. */
  globalThrottle?: Partial<ThrottleOptions>;
  logger?: ControlLogger;
}

class InsecurePairing extends Error {}

type Result = { outcome: CommandOutcome; command?: { id: string; state: CommandState }; replayed?: boolean };

export class InvalidGroupRoles extends Error {}
export class UnsupportedControlOperation extends Error { constructor() { super('Operação não suportada.'); } }

const MESSAGES: Record<ControlErrorCode, string> = {
  insecure_network: 'Pareamento bloqueado: use loopback ou TLS/túnel confiável configurado no Host.',
  invalid_groups: 'Escolha grupos conhecidos e distintos para CHAT e ADM.',
  invalid_request: 'Requisicao invalida.',
  unsupported_version: 'Versao do protocolo nao suportada.',
  unauthenticated: 'Sessao ausente, invalida ou expirada.',
  invalid_credentials: 'Credenciais invalidas.',
  rate_limited: 'Muitas tentativas. Tente novamente mais tarde.',
  expired: 'Comando expirado.',
  conflict: 'Chave de idempotencia reutilizada com outro conteudo.',
  not_found: 'Recurso nao encontrado.',
  renewal_limit: 'Limite de renovacao atingido; faca login novamente.',
  unsupported: 'Operação não suportada neste Host.',
  internal: 'Falha ao executar a operacao no Host.'
};
const fail = (code: ControlErrorCode, retryAfterMs?: number): CommandOutcome =>
  ({ ok: false, error: { code, message: MESSAGES[code], ...(retryAfterMs === undefined ? {} : { retryAfterMs }) } });

export class ControlServer implements ControlMessageHandler {
  private readonly sessions: SessionManager;
  private readonly originThrottle: LoginThrottle;
  private readonly globalThrottle: LoginThrottle;
  private readonly commands: CommandLog;
  private readonly byKey = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<Result>>();
  private readonly now: () => number;

  constructor(private readonly o: ControlServerOptions) {
    if (!isValidPasswordHash(o.adminPasswordHash)) throw new Error('adminPasswordHash is not a valid scrypt hash');
    this.now = () => o.clock.now();
    this.sessions = new SessionManager(this.now, o.session);
    this.originThrottle = new LoginThrottle(this.now, o.originThrottle);
    this.globalThrottle = new LoginThrottle(this.now, { freeAttempts: 30, ...o.globalThrottle });
    this.commands = new CommandLog(this.now);
  }

  /** Read-only view of the host-side command log (state machine). */
  get commandLog(): CommandLog { return this.commands; }
  get activeSessions(): number { return this.sessions.size; }

  async handle(raw: unknown, context?: { pairingAllowed: boolean }): Promise<unknown> {
    const requestId = extractRequestId(raw);
    const reply = (r: Result) => ({
      schemaVersion: SCHEMA_VERSION, requestId,
      ...(r.outcome.ok ? { ok: true as const, data: r.outcome.data } : { ok: false as const, error: r.outcome.error }),
      ...(r.command ? { command: r.command } : {}), ...(r.replayed ? { replayed: true } : {})
    });
    try {
      if (typeof raw === 'object' && raw !== null && (raw as { schemaVersion?: unknown }).schemaVersion !== SCHEMA_VERSION) {
        return reply({ outcome: fail((raw as { schemaVersion?: unknown }).schemaVersion === undefined ? 'invalid_request' : 'unsupported_version') });
      }
      const parsed = ControlRequestSchema.safeParse(raw);
      if (!parsed.success) return reply({ outcome: fail('invalid_request') });
      return reply(await this.dispatch(parsed.data, context?.pairingAllowed === true));
    } catch {
      this.o.logger?.warn('control.internal_error');
      return reply({ outcome: fail('internal') });
    }
  }

  private async dispatch(req: ControlRequest, pairingAllowed: boolean): Promise<Result> {
    if (req.type === 'login') return this.login(req.origin ?? 'unknown', req.payload.password);

    const session = this.sessions.validate(req.token);
    if (!session || !req.token) return { outcome: fail('unauthenticated') };
    const actor = `ADM:${session.id}`;

    if (req.type === 'logout') {
      const revoked = req.payload.all ? this.sessions.revokeAll() : (this.sessions.revoke(req.token) ? 1 : 0);
      await this.audit(req.payload.all ? 'control.logout.all' : 'control.logout', actor, 'session');
      return { outcome: { ok: true, data: { revoked } } };
    }
    if (req.type === 'startPairing' || req.type === 'getConnection' || req.type === 'listWhatsAppGroups') {
      await this.audit(`control.${req.type}`, actor, 'host');
      if (this.now() >= req.expiresAt) return { outcome: fail('expired') };
      if (req.type === 'startPairing' && !pairingAllowed) return { outcome: fail('insecure_network') };
      if (req.type === 'getConnection') return this.read(async () => {
        const state = await this.capability('getConnection')();
        if (state.state === 'aguardando_qr' && !pairingAllowed) throw new InsecurePairing();
        return state;
      });
      if (req.type === 'listWhatsAppGroups') return this.read(() => this.capability('listWhatsAppGroups')());
    }
    if (isMutating(req.type)) return this.mutate(req as ControlRequest & { type: MutatingType; idempotencyKey: string }, session, actor);

    if (this.now() >= req.expiresAt) return { outcome: fail('expired') };
    switch (req.type) {
      case 'renewSession': {
        const r = this.sessions.renew(req.token);
        if (r === undefined) return { outcome: fail('unauthenticated') };
        if (r === 'limit') return { outcome: fail('renewal_limit') };
        await this.audit('control.renewSession', actor, 'session');
        return { outcome: { ok: true, data: { sessionId: r.id, expiresAt: r.expiresAt } } };
      }
      case 'getOverview': return this.read(() => this.o.host.getOverview());
      case 'getHostState': return this.read(() => this.o.host.getHostState());
      case 'listGroups': return this.read(async () => [...await this.o.host.listGroups()]);
      case 'getRanking': { const period = req.payload.period; return this.read(async () => [...await this.o.host.getRanking(period)]); }
      default: return { outcome: fail('invalid_request') };
    }
  }

  private capability<K extends 'getConnection' | 'startPairing' | 'disconnectSession' | 'listWhatsAppGroups' | 'setGroupRoles'>(key: K): NonNullable<HostControlPort[K]> {
    const fn = this.o.host[key];
    if (!fn) throw new UnsupportedControlOperation();
    return fn.bind(this.o.host) as NonNullable<HostControlPort[K]>;
  }
  private async read(fn: () => Promise<unknown>): Promise<Result> {
    try { return { outcome: { ok: true, data: await fn() } }; } catch (error) { this.o.logger?.warn('control.host_error'); return { outcome: fail(error instanceof InsecurePairing ? 'insecure_network' : error instanceof InvalidGroupRoles ? 'invalid_groups' : error instanceof UnsupportedControlOperation ? 'unsupported' : 'internal') }; }
  }

  private async login(origin: string, password: string): Promise<Result> {
    const wait = Math.max(this.originThrottle.retryAfterMs(origin), this.globalThrottle.retryAfterMs('*'));
    if (wait > 0) {
      this.o.logger?.warn('control.login_locked', { retryAfterMs: wait });
      return { outcome: fail('rate_limited', wait) };
    }
    const ok = await verifyPassword(password, this.o.adminPasswordHash);
    if (!ok) {
      this.originThrottle.recordFailure(origin); this.globalThrottle.recordFailure('*');
      await this.audit('control.login.failed', 'ADM:-', origin.slice(0, 64));
      return { outcome: fail('invalid_credentials') };
    }
    this.originThrottle.recordSuccess(origin);
    const { token, session } = this.sessions.create();
    await this.audit('control.login', `ADM:${session.id}`, 'session');
    return { outcome: { ok: true, data: { token, sessionId: session.id, expiresAt: session.expiresAt } } };
  }

  private async mutate(req: ControlRequest & { type: MutatingType; idempotencyKey: string }, session: Session, actor: string): Promise<Result> {
    const fingerprint = createHash('sha256').update(req.type).update('\0').update(JSON.stringify(req.payload)).digest('hex');
    const idx = `${session.id}:${req.idempotencyKey}`;

    const existingId = this.byKey.get(idx);
    const existing = existingId ? this.commands.get(existingId) : undefined;
    if (existing) {
      if (existing.fingerprint !== fingerprint) return { outcome: fail('conflict') };
      const pending = this.inflight.get(idx);
      const result = pending ? await pending : undefined;
      if (result) return { ...result, replayed: true };
      if (existing.outcome) return { outcome: existing.outcome, command: { id: existing.id, state: existing.state }, replayed: true };
    }

    const rec = this.commands.create({ type: req.type, sessionId: session.id, idempotencyKey: req.idempotencyKey, fingerprint, expiresAt: req.expiresAt });
    if (this.commands.expireIfDue(rec.id)) {
      // Expired on arrival: never executed, and not indexed so the client may retry with a fresh deadline.
      rec.outcome = fail('expired');
      await this.audit(`control.${req.type}.expired`, actor, subjectOf(req));
      return { outcome: rec.outcome, command: { id: rec.id, state: rec.state } };
    }
    this.byKey.set(idx, rec.id);
    const run = this.execute(rec, req, actor);
    this.inflight.set(idx, run);
    try { return await run; } finally { this.inflight.delete(idx); }
  }

  private async execute(rec: CommandRecord, req: ControlRequest & { type: MutatingType }, actor: string): Promise<Result> {
    const done = (outcome: CommandOutcome): Result => { rec.outcome = outcome; return { outcome, command: { id: rec.id, state: rec.state } }; };
    try {
      this.commands.transition(rec.id, 'recebido', 'host');
      if (this.commands.expireIfDue(rec.id)) return done(fail('expired'));
      this.commands.transition(rec.id, 'em_execucao', 'host');
    } catch (e) {
      if (e instanceof InvalidTransitionError) { this.safeExpire(rec); return done(fail('expired')); }
      throw e;
    }
    try {
      // Fail closed: if the audit trail cannot be written, the action is not performed.
      await this.audit(actionOf(req), actor, subjectOf(req));
      const data = await this.runHost(req);
      if (data === undefined) { this.commands.transition(rec.id, 'falhou', 'host'); return done(fail('not_found')); }
      this.commands.transition(rec.id, 'concluido', 'host');
      return done({ ok: true, data });
    } catch (error) {
      this.o.logger?.warn('control.command_failed', { type: req.type });
      if (rec.state === 'em_execucao') this.commands.transition(rec.id, 'falhou', 'host');
      await this.audit(`${actionOf(req)}.failed`, actor, subjectOf(req)).catch(() => undefined);
      return done(fail(error instanceof InsecurePairing ? 'insecure_network' : error instanceof InvalidGroupRoles ? 'invalid_groups' : error instanceof UnsupportedControlOperation ? 'unsupported' : 'internal'));
    }
  }

  private safeExpire(rec: CommandRecord): void { try { this.commands.transition(rec.id, 'expirou', 'host'); } catch { /* already terminal */ } }

  private runHost(req: ControlRequest & { type: MutatingType }): Promise<unknown> {
    switch (req.type) {
      case 'startPairing': return this.capability('startPairing')();
      case 'disconnectSession': return this.capability('disconnectSession')();
      case 'setGroupRoles': return this.capability('setGroupRoles')(req.payload);
      case 'setResponsesPaused': return this.o.host.setResponsesPaused(req.payload.paused);
      case 'setMaintenanceMode': return this.o.host.setMaintenanceMode(req.payload.enabled);
      case 'setGroupModules': return this.o.host.setGroupModules(req.payload.groupId, req.payload.modules);
      case 'requestExport': return this.o.host.requestExport(req.payload.dataset);
    }
  }

  private audit(action: string, actorId: string, subjectId: string): Promise<void> {
    return this.o.audit.record({ action, actorId, at: this.now(), subjectId });
  }
}

function actionOf(req: ControlRequest): string {
  switch (req.type) {
    case 'setResponsesPaused': return `control.setResponsesPaused:${req.payload.paused ? 'on' : 'off'}`;
    case 'setMaintenanceMode': return `control.setMaintenanceMode:${req.payload.enabled ? 'on' : 'off'}`;
    case 'setGroupModules': return `control.setGroupModules:${Object.entries(req.payload.modules).map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(',')}`;
    default: return `control.${req.type}`;
  }
}
function subjectOf(req: ControlRequest): string {
  switch (req.type) {
    case 'setGroupModules': return req.payload.groupId;
    case 'requestExport': return req.payload.dataset;
    default: return 'host';
  }
}
function extractRequestId(raw: unknown): string {
  const id = typeof raw === 'object' && raw !== null ? (raw as { requestId?: unknown }).requestId : undefined;
  return typeof id === 'string' && id.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(id) ? id : 'unknown';
}
