import { createHash, randomBytes } from 'node:crypto';

export interface Session { readonly id: string; readonly createdAt: number; expiresAt: number; renewals: number }

export interface SessionOptions { ttlMs: number; maxRenewals: number; maxLifetimeMs: number }
export const DEFAULT_SESSION_OPTIONS: SessionOptions = { ttlMs: 12 * 3600_000, maxRenewals: 3, maxLifetimeMs: 48 * 3600_000 };

export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

/** Opaque 32-byte random tokens; the server keeps only the SHA-256 digest. */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly opts: SessionOptions;
  constructor(private readonly now: () => number, opts: Partial<SessionOptions> = {}) { this.opts = { ...DEFAULT_SESSION_OPTIONS, ...opts }; }

  create(): { token: string; session: Session } {
    this.prune();
    const token = randomBytes(32).toString('base64url');
    const t = this.now();
    const session: Session = { id: randomBytes(4).toString('hex'), createdAt: t, expiresAt: t + this.opts.ttlMs, renewals: 0 };
    this.sessions.set(hashToken(token), session);
    return { token, session };
  }
  validate(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const key = hashToken(token); const s = this.sessions.get(key);
    if (!s) return undefined;
    if (this.now() >= s.expiresAt) { this.sessions.delete(key); return undefined; }
    return s;
  }
  /** Extends expiry; limited by renewal count and absolute lifetime. */
  renew(token: string): Session | 'limit' | undefined {
    const s = this.validate(token);
    if (!s) return undefined;
    const t = this.now();
    if (s.renewals >= this.opts.maxRenewals || t >= s.createdAt + this.opts.maxLifetimeMs) return 'limit';
    s.renewals += 1; s.expiresAt = Math.min(t + this.opts.ttlMs, s.createdAt + this.opts.maxLifetimeMs);
    return s;
  }
  revoke(token: string): boolean { return this.sessions.delete(hashToken(token)); }
  revokeAll(): number { const n = this.sessions.size; this.sessions.clear(); return n; }
  get size(): number { return this.sessions.size; }
  private prune(): void { const t = this.now(); for (const [k, s] of this.sessions) if (t >= s.expiresAt) this.sessions.delete(k); }
}

export interface ThrottleOptions { freeAttempts: number; baseLockMs: number; maxLockMs: number; forgetAfterMs: number; maxEntries: number }
export const DEFAULT_THROTTLE: ThrottleOptions = { freeAttempts: 5, baseLockMs: 30_000, maxLockMs: 15 * 60_000, forgetAfterMs: 3600_000, maxEntries: 5000 };

/** Progressive lockout: after `freeAttempts` failures the lock doubles on each further failure up to a cap. */
export class LoginThrottle {
  private readonly entries = new Map<string, { failures: number; lockedUntil: number; last: number }>();
  private readonly opts: ThrottleOptions;
  constructor(private readonly now: () => number, opts: Partial<ThrottleOptions> = {}) { this.opts = { ...DEFAULT_THROTTLE, ...opts }; }

  /** Milliseconds the key must still wait (0 when allowed). */
  retryAfterMs(key: string): number {
    const e = this.entries.get(key);
    return e ? Math.max(0, e.lockedUntil - this.now()) : 0;
  }
  recordFailure(key: string): void {
    this.prune();
    const t = this.now();
    const e = this.entries.get(key) ?? { failures: 0, lockedUntil: 0, last: t };
    if (t - e.last > this.opts.forgetAfterMs) e.failures = 0;
    e.failures += 1; e.last = t;
    const over = e.failures - this.opts.freeAttempts;
    if (over >= 0) e.lockedUntil = t + Math.min(this.opts.baseLockMs * 2 ** Math.min(over, 20), this.opts.maxLockMs);
    this.entries.set(key, e);
  }
  recordSuccess(key: string): void { this.entries.delete(key); }
  /** A successful verification returns its reserved slot without clearing other failures. */
  releaseSuccess(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    e.failures = Math.max(0, e.failures - 1);
    if (e.failures < this.opts.freeAttempts) e.lockedUntil = 0;
    if (e.failures === 0) this.entries.delete(key);
  }
  private prune(): void {
    if (this.entries.size < this.opts.maxEntries) return;
    const t = this.now();
    for (const [k, e] of this.entries) if (t >= e.lockedUntil && t - e.last > this.opts.forgetAfterMs) this.entries.delete(k);
  }
}
