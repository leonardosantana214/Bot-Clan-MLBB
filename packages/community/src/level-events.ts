import { DatabaseSync } from 'node:sqlite';
import { calculateLevel, defaultLevelFormula, type LevelFormula, type LevelEvent, type LevelEvents, type XpLedger } from '@aerobot/core';
/** Installed on the XP database: event and source transaction commit atomically.
 * Corrections may lower levels, but only upward crossings are recorded/notified.
 * Proposta / pendente de aprovação. One aggregate event per transaction.
 */
export class SqliteLevelEvents implements LevelEvents {
  private readonly db: DatabaseSync;
  constructor(path: string, private readonly formula: LevelFormula = defaultLevelFormula) {
    calculateLevel(0, formula);
    this.db = new DatabaseSync(path);
    try { this.db.exec(`
      CREATE TABLE IF NOT EXISTS level_events (
        transaction_id TEXT PRIMARY KEY, member_id TEXT NOT NULL,
        previous_level INTEGER NOT NULL, new_level INTEGER NOT NULL,
        total_xp INTEGER NOT NULL, occurred_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS level_events_member_time ON level_events(member_id, occurred_at);
      CREATE TRIGGER IF NOT EXISTS level_events_no_update BEFORE UPDATE ON level_events BEGIN SELECT RAISE(ABORT, 'Append-only level events'); END;
      CREATE TRIGGER IF NOT EXISTS level_events_no_delete BEFORE DELETE ON level_events BEGIN SELECT RAISE(ABORT, 'Append-only level events'); END;
    `); } catch (error) { this.db.close(); throw error; }
  }
  wrap(ledger: XpLedger, formula: LevelFormula = this.formula): XpLedger {
    return { list: ledger.list.bind(ledger), ...(ledger.listInRange ? { listInRange: ledger.listInRange.bind(ledger) } : {}), append: async entry => {
      if (!Number.isSafeInteger(entry.amount) || entry.amount === 0 || !Number.isSafeInteger(entry.occurredAt) || !entry.reason.trim() || !entry.actorId.trim()) throw new Error('Invalid transaction');
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const previous = Number(this.db.prepare("SELECT COALESCE(SUM(json_extract(payload, '$.amount')), 0) AS total FROM xp_transaction WHERE member_id = ?").get(entry.memberId)!.total);
        const result = this.db.prepare('INSERT INTO xp_transaction (id, member_id, source, source_id, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run(entry.id, entry.memberId, entry.source, entry.sourceId, JSON.stringify(entry));
        if (result.changes) {
          this.db.prepare('INSERT INTO xp_balance VALUES (?, ?) ON CONFLICT(member_id) DO UPDATE SET amount = amount + excluded.amount').run(entry.memberId, entry.amount);
          const previousLevel = calculateLevel(previous, formula), newLevel = calculateLevel(previous + entry.amount, formula);
          if (newLevel > previousLevel) this.db.prepare('INSERT INTO level_events VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.memberId, previousLevel, newLevel, previous + entry.amount, entry.occurredAt);
        }
        this.db.exec('COMMIT'); return Boolean(result.changes);
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    } };
  }
  async list(memberId: string | undefined, start: number, end: number): Promise<readonly LevelEvent[]> {
    return this.db.prepare('SELECT * FROM level_events WHERE (? IS NULL OR member_id = ?) AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at, rowid').all(memberId ?? null, memberId ?? null, start, end).map(row => ({ transactionId: String(row.transaction_id), memberId: String(row.member_id), previousLevel: Number(row.previous_level), newLevel: Number(row.new_level), totalXp: Number(row.total_xp), occurredAt: Number(row.occurred_at) }));
  }
  close(): void { this.db.close(); }
}
