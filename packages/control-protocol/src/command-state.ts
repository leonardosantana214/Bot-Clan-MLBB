import { randomUUID } from 'node:crypto';
import type { CommandState } from './schemas.js';

export type Actor = 'host' | 'controller';

const NEXT: Readonly<Record<CommandState, readonly CommandState[]>> = {
  pendente: ['recebido', 'expirou', 'cancelado'],
  recebido: ['em_execucao', 'expirou', 'cancelado'],
  em_execucao: ['concluido', 'falhou'],
  concluido: [], falhou: [], expirou: [], cancelado: []
};
/** The controller may only request cancellation; every other transition is Host-owned. */
const CONTROLLER_ALLOWED: ReadonlySet<CommandState> = new Set<CommandState>(['cancelado']);

export function isTerminal(state: CommandState): boolean { return NEXT[state].length === 0; }
export function canTransition(from: CommandState, to: CommandState, actor: Actor): boolean {
  if (!NEXT[from].includes(to)) return false;
  return actor === 'host' || CONTROLLER_ALLOWED.has(to);
}

export class InvalidTransitionError extends Error {
  constructor(readonly from: CommandState, readonly to: CommandState, readonly actor: Actor) {
    super(`invalid transition ${from} -> ${to} by ${actor}`);
    this.name = 'InvalidTransitionError';
  }
}

export type CommandOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; retryAfterMs?: number } };

export interface CommandRecord {
  readonly id: string;
  readonly type: string;
  readonly sessionId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  state: CommandState;
  updatedAt: number;
  /** Serializable outcome kept for safe replay. */
  outcome?: CommandOutcome;
}

/** Host-side log of remote commands enforcing the state machine. */
export class CommandLog {
  private readonly records = new Map<string, CommandRecord>();
  constructor(private readonly now: () => number, private readonly maxRecords = 2000) {}

  create(init: Pick<CommandRecord, 'type' | 'sessionId' | 'idempotencyKey' | 'fingerprint' | 'expiresAt'>): CommandRecord {
    this.prune();
    const t = this.now();
    const rec: CommandRecord = { ...init, id: randomUUID(), createdAt: t, updatedAt: t, state: 'pendente' };
    this.records.set(rec.id, rec);
    return rec;
  }
  get(id: string): CommandRecord | undefined { return this.records.get(id); }
  list(): readonly CommandRecord[] { return [...this.records.values()]; }

  transition(id: string, to: CommandState, actor: Actor): CommandRecord {
    const rec = this.records.get(id);
    if (!rec) throw new Error('unknown command');
    if (!canTransition(rec.state, to, actor)) throw new InvalidTransitionError(rec.state, to, actor);
    // Expired commands never execute, regardless of caller.
    if (to === 'em_execucao' && this.now() >= rec.expiresAt) throw new InvalidTransitionError(rec.state, to, actor);
    rec.state = to; rec.updatedAt = this.now();
    return rec;
  }
  /** Moves a not-yet-running command past its deadline to 'expirou'. Returns true when it is (now) expired. */
  expireIfDue(id: string): boolean {
    const rec = this.records.get(id);
    if (!rec) return false;
    if (rec.state === 'expirou') return true;
    if (rec.state === 'em_execucao' || isTerminal(rec.state)) return false;
    if (this.now() < rec.expiresAt) return false;
    this.transition(id, 'expirou', 'host');
    return true;
  }
  private prune(): void {
    if (this.records.size < this.maxRecords) return;
    for (const [id, rec] of this.records) {
      if (isTerminal(rec.state)) this.records.delete(id);
      if (this.records.size < this.maxRecords * 0.9) break;
    }
  }
}
