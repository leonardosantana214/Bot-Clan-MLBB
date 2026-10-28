import type { XpLedger } from './ports.js';
import { calculateLevel, defaultLevelFormula, type LevelFormula } from '../domain/models.js';
export interface LevelEvent {
  readonly memberId: string; readonly previousLevel: number; readonly newLevel: number;
  readonly totalXp: number; readonly occurredAt: number; readonly transactionId: string;
}
export interface LevelEvents {
  list(memberId: string | undefined, start: number, end: number): Promise<readonly LevelEvent[]>;
}
export class InMemoryLevelEvents implements LevelEvents {
  private readonly events = new Map<string, LevelEvent>();
  private queue: Promise<unknown> = Promise.resolve();
  wrap(ledger: XpLedger, formula: LevelFormula = defaultLevelFormula): XpLedger {
    return { list: ledger.list.bind(ledger), ...(ledger.listInRange ? { listInRange: ledger.listInRange.bind(ledger) } : {}), append: entry => {
      const work = this.queue.then(async () => {
        const previous = (await ledger.list(entry.memberId)).reduce((sum, e) => sum + e.amount, 0);
        const newLevel = calculateLevel(previous + entry.amount, formula);
        const appended = await ledger.append(entry);
        const previousLevel = calculateLevel(previous, formula);
        if (appended && newLevel > previousLevel) this.record({ memberId: entry.memberId, previousLevel, newLevel, totalXp: previous + entry.amount, occurredAt: entry.occurredAt, transactionId: entry.id });
        return appended;
      });
      this.queue = work.catch(() => undefined); return work;
    } };
  }
  private record(event: LevelEvent): void { if (!this.events.has(event.transactionId)) this.events.set(event.transactionId, Object.freeze({ ...event })); }
  async list(memberId: string | undefined, start: number, end: number): Promise<readonly LevelEvent[]> {
    return [...this.events.values()].filter(e => (memberId === undefined || e.memberId === memberId) && e.occurredAt >= start && e.occurredAt < end).sort((a, b) => a.occurredAt - b.occurredAt).map(e => ({ ...e }));
  }
}
