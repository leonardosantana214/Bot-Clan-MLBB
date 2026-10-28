import type { z } from 'zod';
import {
  ControlResponseSchema, ExportReceiptSchema, GroupRouteSchema, HostStateSchema, LoginResultSchema, LogoutResultSchema,
  OverviewSchema, RankEntrySchema, SCHEMA_VERSION, SessionInfoSchema,
  type ControlErrorCode, type ExportDataset, type ExportReceipt, type GroupModulesPatch, type GroupRoute, type HostState,
  type Overview, type RankEntry, type RankingPeriod
} from './schemas.js';
import type { ControlTransport } from './transport.js';

const randomUUID = (): string => globalThis.crypto.randomUUID();

export type ClientErrorCode = ControlErrorCode | 'invalid_response' | 'not_logged_in' | 'transport';

export class ControlClientError extends Error {
  constructor(readonly code: ClientErrorCode, message: string, readonly retryAfterMs?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ControlClientError';
  }
}

export interface ControlClientOptions {
  /** Request lifetime; the Host refuses to run commands past it. Default 30 s. */
  requestTtlMs?: number;
  clock?: { now(): number };
  origin?: string;
  /** Called once when the Host reports the session as gone (expired/revoked). */
  onSessionExpired?: () => void;
}
export interface CommandOptions { /** Reuse the same key to retry safely after a transport failure. */ idempotencyKey?: string }

/** Typed Controller-side API. Holds the session token in memory only. */
export class ControlClient {
  private token: string | undefined;
  private readonly ttl: number;
  private readonly clock: { now(): number };

  constructor(private readonly transport: ControlTransport, private readonly opts: ControlClientOptions = {}) {
    this.ttl = opts.requestTtlMs ?? 30_000;
    this.clock = opts.clock ?? { now: () => Date.now() };
  }
  get isLoggedIn(): boolean { return this.token !== undefined; }

  async login(password: string): Promise<{ sessionId: string; expiresAt: number }> {
    const r = await this.call('login', { password }, LoginResultSchema, { auth: false });
    this.token = r.token;
    return { sessionId: r.sessionId, expiresAt: r.expiresAt };
  }
  async logout(all = false): Promise<void> {
    try { await this.call('logout', all ? { all: true } : {}, LogoutResultSchema); } finally { this.token = undefined; }
  }
  renewSession(): Promise<{ sessionId: string; expiresAt: number }> { return this.call('renewSession', {}, SessionInfoSchema); }
  getOverview(): Promise<Overview> { return this.call('getOverview', {}, OverviewSchema); }
  getHostState(): Promise<HostState> { return this.call('getHostState', {}, HostStateSchema); }
  listGroups(): Promise<GroupRoute[]> { return this.call('listGroups', {}, GroupRouteSchema.array()); }
  getRanking(period: RankingPeriod): Promise<RankEntry[]> { return this.call('getRanking', { period }, RankEntrySchema.array()); }
  setResponsesPaused(paused: boolean, o: CommandOptions = {}): Promise<HostState> {
    return this.call('setResponsesPaused', { paused }, HostStateSchema, { key: o.idempotencyKey ?? randomUUID() });
  }
  setMaintenanceMode(enabled: boolean, o: CommandOptions = {}): Promise<HostState> {
    return this.call('setMaintenanceMode', { enabled }, HostStateSchema, { key: o.idempotencyKey ?? randomUUID() });
  }
  setGroupModules(groupId: string, modules: GroupModulesPatch, o: CommandOptions = {}): Promise<GroupRoute> {
    return this.call('setGroupModules', { groupId, modules }, GroupRouteSchema, { key: o.idempotencyKey ?? randomUUID() });
  }
  requestExport(dataset: ExportDataset, o: CommandOptions = {}): Promise<ExportReceipt> {
    return this.call('requestExport', { dataset }, ExportReceiptSchema, { key: o.idempotencyKey ?? randomUUID() });
  }

  private async call<S extends z.ZodTypeAny>(type: string, payload: unknown, schema: S, o: { auth?: boolean; key?: string } = {}): Promise<z.infer<S>> {
    const auth = o.auth !== false;
    if (auth && !this.token) throw new ControlClientError('not_logged_in', 'Login required.');
    const request = {
      schemaVersion: SCHEMA_VERSION, requestId: randomUUID(), type, payload,
      expiresAt: this.clock.now() + this.ttl,
      ...(o.key ? { idempotencyKey: o.key } : {}),
      ...(this.opts.origin ? { origin: this.opts.origin } : {}),
      ...(auth && this.token ? { token: this.token } : {})
    };
    let raw: unknown;
    try { raw = await this.transport.send(request); } catch (cause) {
      throw new ControlClientError('transport', 'Transport failure.', undefined, { cause });
    }
    const res = ControlResponseSchema.safeParse(raw);
    if (!res.success) throw new ControlClientError('invalid_response', 'Malformed response from Host.');
    if (!res.data.ok) {
      const e = res.data.error;
      if (auth && e.code === 'unauthenticated') { this.token = undefined; this.opts.onSessionExpired?.(); }
      throw new ControlClientError(e.code, e.message, e.retryAfterMs);
    }
    const data = schema.safeParse(res.data.data);
    if (!data.success) throw new ControlClientError('invalid_response', 'Unexpected response payload.');
    return data.data;
  }
}
