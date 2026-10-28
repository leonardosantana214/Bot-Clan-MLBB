import { DatabaseSync } from 'node:sqlite';
import { CandidateSchema, ScoutNoteSchema, type Candidate, type ScoutNote } from './schemas.js';
export * from './schemas.js';
export interface ScoutPort { list(): Candidate[]; save(candidate: Candidate): void; notes(candidateId: string): ScoutNote[]; appendNote(note: ScoutNote): boolean }
export class MemoryScout implements ScoutPort {
  private candidates = new Map<string, Candidate>(); private history: ScoutNote[] = [];
  list() { return structuredClone([...this.candidates.values()]); }
  save(candidate: Candidate) { const c = CandidateSchema.parse(candidate); this.candidates.set(c.id, c); }
  notes(id: string) { return structuredClone(this.history.filter(n => n.candidateId === id)); }
  appendNote(note: ScoutNote) { const n = ScoutNoteSchema.parse(note); if (!this.candidates.has(n.candidateId)) throw new Error('Candidato não encontrado.'); if (this.history.some(e => e.id === n.id)) return false; this.history.push(n); return true; }
}
export class SqliteScout implements ScoutPort {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS scout_candidates(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scout_notes(id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES scout_candidates(id), payload TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS scout_notes_no_update BEFORE UPDATE ON scout_notes BEGIN SELECT RAISE(ABORT, 'Append-only notes'); END;
      CREATE TRIGGER IF NOT EXISTS scout_notes_no_delete BEFORE DELETE ON scout_notes BEGIN SELECT RAISE(ABORT, 'Append-only notes'); END;`);
  }
  list() { return this.db.prepare('SELECT payload FROM scout_candidates ORDER BY id').all().map(r => CandidateSchema.parse(JSON.parse(String(r.payload)))); }
  save(candidate: Candidate) { const c = CandidateSchema.parse(candidate); this.db.prepare('INSERT INTO scout_candidates VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(c.id, JSON.stringify(c)); }
  notes(id: string) { return this.db.prepare('SELECT payload FROM scout_notes WHERE candidate_id=? ORDER BY rowid').all(id).map(r => ScoutNoteSchema.parse(JSON.parse(String(r.payload)))); }
  appendNote(note: ScoutNote) { const n = ScoutNoteSchema.parse(note); if (!this.db.prepare('SELECT 1 FROM scout_candidates WHERE id=?').get(n.candidateId)) throw new Error('Candidato não encontrado.'); return Boolean(this.db.prepare('INSERT INTO scout_notes VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').run(n.id,n.candidateId,JSON.stringify(n)).changes); }
  close() { this.db.close(); }
}
