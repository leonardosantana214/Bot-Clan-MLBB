import { DatabaseSync } from 'node:sqlite';
import type { AuditEvent, AuditLog, Clock } from '@aerobot/core';

const DAY = 86_400_000;
export const ANONYMIZED_NAME = 'Anonimizado';
/** Audit actions that mark the moment a member left/was deleted (used when the profile has no `leftAt`). */
export const DEPARTURE_ACTIONS = ['member.left', 'member.deleted', 'member.status.left', 'member.status.deleted'] as const;

export interface DepartedMember { readonly memberId: string; readonly status: 'left' | 'deleted'; readonly departedAt: number; readonly anonymized: boolean }

/** Port: everything retention needs, with no knowledge of SQL. */
export interface RetentionStore {
  /** Members whose status is left/deleted and for which a departure date is known. */
  listDepartedMembers(): Promise<readonly DepartedMember[]>;
  /** Number of left/deleted members with no recorded departure date (never touched). */
  countDepartedWithoutDate(): Promise<number>;
  /** Removes personal fields of the profile; returns false if nothing changed (already anonymized / no longer departed). */
  anonymizeMember(memberId: string, at: number): Promise<boolean>;
  countTechnicalLogsOlderThan(cutoff: number): Promise<number>;
  purgeTechnicalLogsOlderThan(cutoff: number): Promise<number>;
}

export interface RetentionPolicy {
  /** Days after departure before the profile is anonymized (docs: 90). */
  departedMemberDays: number;
  /** Days to keep technical logs (docs: 30). */
  technicalLogDays: number;
}
export const defaultRetentionPolicy: RetentionPolicy = { departedMemberDays: 90, technicalLogDays: 30 };

export interface RetentionOptions {
  store: RetentionStore;
  audit: AuditLog;
  clock: Clock;
  actorId: string;
  policy?: Partial<RetentionPolicy>;
  /** Must be explicitly true to change anything. Default is a dry run. */
  execute?: boolean;
}
export interface RetentionReport {
  dryRun: boolean;
  at: number;
  policy: RetentionPolicy;
  membersToAnonymize: readonly string[];
  membersAnonymized: number;
  membersSkippedWithoutDate: number;
  technicalLogsAffected: number;
  /** Ledger and audit log are append-only and never altered here. */
  untouched: readonly string[];
}

function checkDays(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid retention value for ${name}`);
}

export async function applyRetention(options: RetentionOptions): Promise<RetentionReport> {
  const policy = { ...defaultRetentionPolicy, ...options.policy };
  checkDays('departedMemberDays', policy.departedMemberDays);
  checkDays('technicalLogDays', policy.technicalLogDays);
  const dryRun = options.execute !== true;
  const now = options.clock.now();
  const event = (action: string, subjectId: string): AuditEvent => ({ action, actorId: options.actorId, at: now, subjectId });
  const memberCutoff = now - policy.departedMemberDays * DAY;
  const logCutoff = now - policy.technicalLogDays * DAY;

  const due = (await options.store.listDepartedMembers()).filter(m => !m.anonymized && m.departedAt <= memberCutoff);
  const skipped = await options.store.countDepartedWithoutDate();
  let anonymized = 0;
  let logs: number;
  if (dryRun) {
    logs = await options.store.countTechnicalLogsOlderThan(logCutoff);
    await options.audit.record(event('retention.dry-run', `members:${due.length};technical-logs:${logs}`));
  } else {
    for (const member of due) {
      await options.audit.record(event('retention.member.anonymize', member.memberId)); // intent recorded before acting
      if (await options.store.anonymizeMember(member.memberId, now)) anonymized++;
    }
    logs = await options.store.purgeTechnicalLogsOlderThan(logCutoff);
    await options.audit.record(event('retention.run', `members:${anonymized};technical-logs:${logs}`));
  }
  return {
    dryRun, at: now, policy, membersToAnonymize: due.map(m => m.memberId), membersAnonymized: anonymized,
    membersSkippedWithoutDate: skipped, technicalLogsAffected: logs, untouched: ['xp_transaction', 'xp_balance', 'audit_log']
  };
}

/**
 * SQLite implementation over the storage-sqlite v1 schema, using its own connection (WAL, busy_timeout).
 * Only `member`, `whatsapp_identity` and `seen_message` (technical dedupe records) are modified;
 * `xp_transaction` and `audit_log` are append-only (triggers) and are never touched.
 */
export class SqliteRetentionStore implements RetentionStore {
  private readonly db: DatabaseSync;
  /** Audit sink writing to the same audit_log table (append-only INSERT). */
  readonly audit: AuditLog;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA busy_timeout = 5000');
      const version = this.db.prepare('SELECT MAX(version) AS v FROM schema_version').get()?.v;
      if (version !== 1) throw new Error('Unsupported SQLite schema');
    } catch (error) { this.db.close(); throw error; }
    this.audit = { record: async event => { this.db.prepare('INSERT INTO audit_log (payload) VALUES (?)').run(JSON.stringify(event)); } };
  }
  close(): void { this.db.close(); }

  private departed(): { id: string; status: 'left' | 'deleted'; departedAt: number | undefined; anonymized: boolean }[] {
    const rows = this.db.prepare("SELECT id, json_extract(payload, '$.status') AS status, json_extract(payload, '$.leftAt') AS left_at, json_extract(payload, '$.anonymizedAt') AS anon FROM member WHERE json_extract(payload, '$.status') IN ('left', 'deleted')").all();
    const placeholders = DEPARTURE_ACTIONS.map(() => '?').join(',');
    const fromAudit = this.db.prepare(`SELECT MAX(json_extract(payload, '$.at')) AS at FROM audit_log WHERE json_extract(payload, '$.subjectId') = ? AND json_extract(payload, '$.action') IN (${placeholders})`);
    return rows.map(row => {
      let at = typeof row.left_at === 'number' && Number.isSafeInteger(row.left_at) ? row.left_at : undefined;
      if (at === undefined) { const found = fromAudit.get(String(row.id), ...DEPARTURE_ACTIONS)?.at; at = typeof found === 'number' ? found : undefined; }
      return { id: String(row.id), status: row.status as 'left' | 'deleted', departedAt: at, anonymized: row.anon != null };
    });
  }
  async listDepartedMembers(): Promise<readonly DepartedMember[]> {
    return this.departed().flatMap(m => m.departedAt === undefined ? [] : [{ memberId: m.id, status: m.status, departedAt: m.departedAt, anonymized: m.anonymized }]);
  }
  async countDepartedWithoutDate(): Promise<number> { return this.departed().filter(m => m.departedAt === undefined && !m.anonymized).length; }
  async anonymizeMember(memberId: string, at: number): Promise<boolean> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare("UPDATE member SET payload = json_set(payload, '$.name', ?, '$.identities', json('[]'), '$.anonymizedAt', ?) WHERE id = ? AND json_extract(payload, '$.status') IN ('left', 'deleted') AND json_extract(payload, '$.anonymizedAt') IS NULL").run(ANONYMIZED_NAME, at, memberId);
      if (result.changes) this.db.prepare('DELETE FROM whatsapp_identity WHERE member_id = ?').run(memberId);
      this.db.exec('COMMIT');
      return Boolean(result.changes);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async countTechnicalLogsOlderThan(cutoff: number): Promise<number> {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM seen_message WHERE seen_at < ?').get(cutoff)!.n);
  }
  async purgeTechnicalLogsOlderThan(cutoff: number): Promise<number> {
    return Number(this.db.prepare('DELETE FROM seen_message WHERE seen_at < ?').run(cutoff).changes);
  }
}
