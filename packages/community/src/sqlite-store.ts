import { DatabaseSync } from 'node:sqlite';
import type { CommunityStore, MembershipEventFilter, NotificationPatch } from './ports.js';
import type { AdminEventType, MembershipEvent, ModerationFlag, ModerationKind, NotificationRecord, NotificationState, PresenceRecord, ReviewCase, Warning } from './types.js';

const SCHEMA_VERSION = 1;
type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v);
const num = (v: unknown): number => Number(v);
const nstr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const nnum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const LEDGERS = ['comm_membership_event', 'comm_moderation_flag', 'comm_warning'];

/** SQLite adapter. Accepts an open DatabaseSync (caller owns it) or a path (this store owns it). */
export class SqliteCommunityStore implements CommunityStore {
  private readonly db: DatabaseSync;
  private readonly owned: boolean;

  constructor(target: DatabaseSync | string) {
    this.owned = typeof target === 'string';
    this.db = typeof target === 'string' ? new DatabaseSync(target) : target;
    try {
      if (this.owned) this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
      this.migrate();
    } catch (error) { if (this.owned) this.db.close(); throw error; }
  }

  close(): void { if (this.owned) this.db.close(); }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS comm_schema_version (version INTEGER PRIMARY KEY)');
    const version = num(this.db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM comm_schema_version').get()!.version);
    if (version > SCHEMA_VERSION) throw new Error('Unsupported community schema version');
    if (version === SCHEMA_VERSION) return;
    const triggers = LEDGERS.map(t => `
      CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;`).join('');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS comm_membership_event (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, group_id TEXT NOT NULL, participant_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('join','leave')), at INTEGER NOT NULL, origin TEXT NOT NULL,
        member_id TEXT, pending_registration INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS comm_membership_event_participant ON comm_membership_event(participant_id, at);
      CREATE INDEX IF NOT EXISTS comm_membership_event_group ON comm_membership_event(group_id, at);
      CREATE TABLE IF NOT EXISTS comm_presence (
        group_id TEXT NOT NULL, participant_id TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('present','left')), at INTEGER NOT NULL,
        PRIMARY KEY (group_id, participant_id));
      CREATE INDEX IF NOT EXISTS comm_presence_participant ON comm_presence(participant_id);
      CREATE TABLE IF NOT EXISTS comm_review_case (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, participant_id TEXT NOT NULL, member_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('open','resolved')), opened_at INTEGER NOT NULL, resolved_at INTEGER, resolved_by TEXT, reason TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS comm_review_case_one_open ON comm_review_case(participant_id) WHERE status = 'open';
      CREATE TABLE IF NOT EXISTS comm_moderation_flag (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, group_id TEXT NOT NULL,
        sender_ref TEXT NOT NULL, member_id TEXT, at INTEGER NOT NULL, detail TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS comm_moderation_flag_group ON comm_moderation_flag(group_id, at);
      CREATE TABLE IF NOT EXISTS comm_warning (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, member_id TEXT NOT NULL, reason TEXT NOT NULL,
        author_id TEXT NOT NULL, author_name TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS comm_warning_member ON comm_warning(member_id, at);
      CREATE TABLE IF NOT EXISTS comm_notification_claim (event_id TEXT NOT NULL, destination TEXT NOT NULL, PRIMARY KEY (event_id, destination));
      CREATE TABLE IF NOT EXISTS comm_notification (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, destination TEXT NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('registered','queued','sent','confirmed','failed')), attempts INTEGER NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, last_error TEXT);
      CREATE INDEX IF NOT EXISTS comm_notification_state ON comm_notification(state, next_attempt_at);
      ${triggers}
      INSERT OR IGNORE INTO comm_schema_version(version) VALUES (${SCHEMA_VERSION});
    `);
  }

  private changed(result: { changes: number | bigint }): boolean { return Number(result.changes) > 0; }

  async appendMembershipEvent(e: MembershipEvent): Promise<boolean> {
    return this.changed(this.db.prepare('INSERT OR IGNORE INTO comm_membership_event (id, group_id, participant_id, action, at, origin, member_id, pending_registration) VALUES (?,?,?,?,?,?,?,?)')
      .run(e.id, e.groupId, e.participantId, e.action, e.at, e.origin, e.memberId, e.pendingRegistration ? 1 : 0));
  }
  async listMembershipEvents(filter: MembershipEventFilter = {}): Promise<readonly MembershipEvent[]> {
    const rows = this.db.prepare('SELECT * FROM comm_membership_event WHERE (? IS NULL OR group_id = ?) AND (? IS NULL OR participant_id = ?) ORDER BY seq')
      .all(filter.groupId ?? null, filter.groupId ?? null, filter.participantId ?? null, filter.participantId ?? null) as Row[];
    return rows.map(r => Object.freeze({ id: str(r.id), groupId: str(r.group_id), participantId: str(r.participant_id), action: str(r.action) as MembershipEvent['action'], at: num(r.at), origin: str(r.origin) as MembershipEvent['origin'], memberId: nstr(r.member_id), pendingRegistration: num(r.pending_registration) === 1 }));
  }
  async setPresence(p: PresenceRecord): Promise<void> {
    this.db.prepare('INSERT INTO comm_presence (group_id, participant_id, state, at) VALUES (?,?,?,?) ON CONFLICT(group_id, participant_id) DO UPDATE SET state = excluded.state, at = excluded.at').run(p.groupId, p.participantId, p.state, p.at);
  }
  async getPresence(participantId: string): Promise<readonly PresenceRecord[]> {
    return (this.db.prepare('SELECT * FROM comm_presence WHERE participant_id = ? ORDER BY group_id').all(participantId) as Row[])
      .map(r => Object.freeze({ groupId: str(r.group_id), participantId: str(r.participant_id), state: str(r.state) as PresenceRecord['state'], at: num(r.at) }));
  }
  async openReviewCase(c: ReviewCase): Promise<boolean> {
    return this.changed(this.db.prepare('INSERT OR IGNORE INTO comm_review_case (id, participant_id, member_id, status, opened_at, resolved_at, resolved_by, reason) VALUES (?,?,?,?,?,?,?,?)')
      .run(c.id, c.participantId, c.memberId, c.status, c.openedAt, c.resolvedAt, c.resolvedBy, c.reason));
  }
  async listReviewCases(status?: ReviewCase['status']): Promise<readonly ReviewCase[]> {
    return (this.db.prepare('SELECT * FROM comm_review_case WHERE (? IS NULL OR status = ?) ORDER BY seq').all(status ?? null, status ?? null) as Row[])
      .map(r => Object.freeze({ id: str(r.id), participantId: str(r.participant_id), memberId: nstr(r.member_id), status: str(r.status) as ReviewCase['status'], openedAt: num(r.opened_at), resolvedAt: nnum(r.resolved_at), resolvedBy: nstr(r.resolved_by), reason: str(r.reason) }));
  }
  async resolveReviewCase(id: string, at: number, by: string): Promise<boolean> {
    return this.changed(this.db.prepare("UPDATE comm_review_case SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'open'").run(at, by, id));
  }
  async appendFlag(f: ModerationFlag): Promise<boolean> {
    return this.changed(this.db.prepare('INSERT OR IGNORE INTO comm_moderation_flag (id, kind, group_id, sender_ref, member_id, at, detail) VALUES (?,?,?,?,?,?,?)').run(f.id, f.kind, f.groupId, f.senderRef, f.memberId, f.at, f.detail));
  }
  async listFlags(groupId?: string): Promise<readonly ModerationFlag[]> {
    return (this.db.prepare('SELECT * FROM comm_moderation_flag WHERE (? IS NULL OR group_id = ?) ORDER BY seq').all(groupId ?? null, groupId ?? null) as Row[])
      .map(r => Object.freeze({ id: str(r.id), kind: str(r.kind) as ModerationKind, groupId: str(r.group_id), senderRef: str(r.sender_ref), memberId: nstr(r.member_id), at: num(r.at), detail: str(r.detail) }));
  }
  async appendWarning(w: Warning): Promise<boolean> {
    return this.changed(this.db.prepare('INSERT OR IGNORE INTO comm_warning (id, member_id, reason, author_id, author_name, at) VALUES (?,?,?,?,?,?)').run(w.id, w.memberId, w.reason, w.authorId, w.authorName, w.at));
  }
  async listWarnings(memberId: string): Promise<readonly Warning[]> {
    return (this.db.prepare('SELECT * FROM comm_warning WHERE member_id = ? ORDER BY seq').all(memberId) as Row[])
      .map(r => Object.freeze({ id: str(r.id), memberId: str(r.member_id), reason: str(r.reason), authorId: str(r.author_id), authorName: str(r.author_name), at: num(r.at) }));
  }
  async claimNotificationEvent(eventId: string, destination: string): Promise<boolean> {
    return this.changed(this.db.prepare('INSERT OR IGNORE INTO comm_notification_claim (event_id, destination) VALUES (?,?)').run(eventId, destination));
  }
  async claimAndSaveNotification(eventId: string, n: NotificationRecord): Promise<boolean> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const claimed = this.changed(this.db.prepare('INSERT OR IGNORE INTO comm_notification_claim (event_id, destination) VALUES (?,?)').run(eventId, n.destination));
      if (claimed) this.db.prepare('INSERT INTO comm_notification (id, destination, type, text, state, attempts, created_at, updated_at, next_attempt_at, last_error) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at')
        .run(n.id, n.destination, n.type, n.text, n.state === 'accepted' ? 'sent' : n.state, n.attempts, n.createdAt, n.updatedAt, n.nextAttemptAt, n.lastError);
      this.db.exec('COMMIT');
      return claimed;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async saveNotification(n: NotificationRecord): Promise<boolean> {
    return this.changed(this.db.prepare('INSERT OR IGNORE INTO comm_notification (id, destination, type, text, state, attempts, created_at, updated_at, next_attempt_at, last_error) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(n.id, n.destination, n.type, n.text, n.state === 'accepted' ? 'sent' : n.state, n.attempts, n.createdAt, n.updatedAt, n.nextAttemptAt, n.lastError));
  }
  async updateNotification(id: string, p: NotificationPatch): Promise<void> {
    this.db.prepare('UPDATE comm_notification SET text = COALESCE(?, text), state = ?, attempts = COALESCE(?, attempts), updated_at = ?, next_attempt_at = COALESCE(?, next_attempt_at), last_error = CASE WHEN ? THEN ? ELSE last_error END WHERE id = ?')
      .run(p.text ?? null, p.state === 'accepted' ? 'sent' : p.state, p.attempts ?? null, p.updatedAt, p.nextAttemptAt ?? null, p.lastError === undefined ? 0 : 1, p.lastError ?? null, id);
  }
  async listNotifications(state?: NotificationState): Promise<readonly NotificationRecord[]> {
    return (this.db.prepare('SELECT * FROM comm_notification WHERE (? IS NULL OR state = ?) ORDER BY seq').all(state === 'accepted' ? 'sent' : state ?? null, state === 'accepted' ? 'sent' : state ?? null) as Row[])
      .map(r => Object.freeze({ id: str(r.id), destination: str(r.destination), type: str(r.type) as AdminEventType, text: str(r.text), state: (r.state === 'sent' ? 'accepted' : str(r.state)) as NotificationState, attempts: num(r.attempts), createdAt: num(r.created_at), updatedAt: num(r.updated_at), nextAttemptAt: num(r.next_attempt_at), lastError: nstr(r.last_error) }));
  }
}
