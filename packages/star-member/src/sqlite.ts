import { DatabaseSync } from 'node:sqlite';
import type { Raffle, ScoreEntry, Snapshot, StarRepository, StarState } from './model.js';

import { assertAppendOnly } from './invariants.js';
/** Owns connections opened by path; a supplied DatabaseSync remains owned by the caller. */
export class SqliteStarRepository implements StarRepository {
  private readonly db: DatabaseSync;
  private readonly owned: boolean;
  constructor(database: string | DatabaseSync) {
    this.owned = typeof database === 'string';
    this.db = typeof database === 'string' ? new DatabaseSync(database) : database;
    try {
      this.db.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
      this.db.exec('CREATE TABLE IF NOT EXISTS star_schema_version (version INTEGER PRIMARY KEY)');
      const version = Number(this.db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM star_schema_version').get()!.version);
      if (version > 1) throw new Error('Versão star_ não suportada.');
      if (version === 0) this.db.exec(`
        CREATE TABLE star_entries (id TEXT PRIMARY KEY, period TEXT NOT NULL, member_id TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE INDEX star_entries_period_member ON star_entries(period, member_id);
        CREATE TABLE star_snapshots (period TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(period, version));
        CREATE TABLE star_raffles (period TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(period, version));
        CREATE TABLE star_raffle_approvals (period TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(period, version), FOREIGN KEY(period, version) REFERENCES star_raffles(period, version));
        CREATE TRIGGER star_entries_no_update BEFORE UPDATE ON star_entries BEGIN SELECT RAISE(ABORT, 'Append-only ledger'); END;
        CREATE TRIGGER star_entries_no_delete BEFORE DELETE ON star_entries BEGIN SELECT RAISE(ABORT, 'Append-only ledger'); END;
        CREATE TRIGGER star_snapshots_no_update BEFORE UPDATE ON star_snapshots BEGIN SELECT RAISE(ABORT, 'Append-only snapshot'); END;
        CREATE TRIGGER star_snapshots_no_delete BEFORE DELETE ON star_snapshots BEGIN SELECT RAISE(ABORT, 'Append-only snapshot'); END;
        CREATE TRIGGER star_raffles_no_update BEFORE UPDATE ON star_raffles BEGIN SELECT RAISE(ABORT, 'Append-only raffle'); END;
        CREATE TRIGGER star_raffles_no_delete BEFORE DELETE ON star_raffles BEGIN SELECT RAISE(ABORT, 'Append-only raffle'); END;
        CREATE TRIGGER star_approvals_no_update BEFORE UPDATE ON star_raffle_approvals BEGIN SELECT RAISE(ABORT, 'Append-only approval'); END;
        CREATE TRIGGER star_approvals_no_delete BEFORE DELETE ON star_raffle_approvals BEGIN SELECT RAISE(ABORT, 'Append-only approval'); END;
        INSERT INTO star_schema_version VALUES (1);
      `);
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } finally { if (this.owned) this.db.close(); }
      throw error;
    }
  }
  read(): StarState {
    const entries = this.db.prepare('SELECT payload FROM star_entries ORDER BY rowid').all().map(r => JSON.parse(String(r.payload)) as ScoreEntry);
    const snapshots = this.db.prepare('SELECT payload FROM star_snapshots ORDER BY rowid').all().map(r => JSON.parse(String(r.payload)) as Snapshot);
    const raffles = this.db.prepare('SELECT r.payload, a.payload AS approved FROM star_raffles r LEFT JOIN star_raffle_approvals a ON a.period = r.period AND a.version = r.version ORDER BY r.rowid').all().map(r => JSON.parse(String(r.approved ?? r.payload)) as Raffle);
    return { entries, snapshots, raffles };
  }
  transaction<T>(work: (state: StarState) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.read();
      const after = structuredClone(before);
      const result = work(after);
      assertAppendOnly(before, after);
      for (const e of after.entries.slice(before.entries.length)) this.db.prepare('INSERT INTO star_entries VALUES (?, ?, ?, ?)').run(e.id, e.period, e.memberId, JSON.stringify(e));
      for (const s of after.snapshots.slice(before.snapshots.length)) this.db.prepare('INSERT INTO star_snapshots VALUES (?, ?, ?)').run(s.period, s.version, JSON.stringify(s));
      if (after.raffles.length < before.raffles.length) throw new Error('Sorteios imutáveis.');
      for (let i = 0; i < after.raffles.length; i++) {
        const next = after.raffles[i]!;
        const old = before.raffles[i];
        if (!old) this.db.prepare('INSERT INTO star_raffles VALUES (?, ?, ?)').run(next.period, next.snapshotVersion, JSON.stringify(next));
        else if (JSON.stringify(old) !== JSON.stringify(next)) {
          if (old.status !== 'pendente de aprovação' || next.status !== 'publicado' || !next.approval || JSON.stringify({ ...next, status: old.status, approval: undefined }) !== JSON.stringify(old)) throw new Error('Sorteio imutável.');
          this.db.prepare('INSERT INTO star_raffle_approvals VALUES (?, ?, ?)').run(next.period, next.snapshotVersion, JSON.stringify(next));
        }
      }
      this.db.exec('COMMIT');
      return structuredClone(result);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close(): void { if (this.owned) this.db.close(); }
}
