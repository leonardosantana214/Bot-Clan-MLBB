import { DatabaseSync } from 'node:sqlite';
import type { AuditEvent, AuditLog, GroupRoute, GroupRouteRegistry, Member, MemberRepository, SeenMessageStore, XpLedger, XpTransaction } from '@aerobot/core';

/** One connection owns all ports. Close it when the host stops. No message bodies are stored. */
export class SqliteStorage {
  private readonly db: DatabaseSync;
  readonly members: MemberRepository;
  readonly routes: GroupRouteRegistry;
  readonly ledger: XpLedger;
  readonly audit: AuditLog & { list(): readonly AuditEvent[] };
  readonly seenMessages: SeenMessageStore;

  constructor(path: string, routes: readonly GroupRoute[] = []) {
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
      this.migrate();
      this.transaction(() => {
        for (const route of routes) this.db.prepare('INSERT INTO group_route VALUES (?, ?) ON CONFLICT(group_id) DO UPDATE SET payload = excluded.payload').run(route.platformGroupId, JSON.stringify(route));
      });
    } catch (error) { this.db.close(); throw error; }
    this.members = {
      list: async () => this.db.prepare('SELECT payload FROM member ORDER BY rowid').all().map(row => JSON.parse(String(row.payload)) as Member),
      findByIdentity: async identity => {
        const row = this.db.prepare('SELECT m.payload FROM member m JOIN whatsapp_identity w ON w.member_id = m.id WHERE w.platform_user_id = ?').get(identity);
        return row ? JSON.parse(String(row.payload)) as Member : undefined;
      },
      register: async member => this.transaction(() => {
        if (this.db.prepare('SELECT 1 FROM member WHERE id = ?').get(member.id)) return false;
        const identities = member.identities.map(id => id.platformUserId);
        if (new Set(identities).size !== identities.length || identities.some(id => this.db.prepare('SELECT 1 FROM whatsapp_identity WHERE platform_user_id = ?').get(id))) return false;
        this.db.prepare('INSERT INTO member VALUES (?, ?)').run(member.id, JSON.stringify(member));
        for (const identity of identities) this.db.prepare('INSERT INTO whatsapp_identity VALUES (?, ?)').run(identity, member.id);
        return true;
      })
    };
    this.routes = { find: async id => {
      const row = this.db.prepare('SELECT payload FROM group_route WHERE group_id = ?').get(id);
      return row ? JSON.parse(String(row.payload)) as GroupRoute : undefined;
    } };
    this.ledger = {
      listInRange: async (start, end) => Object.freeze(this.db.prepare("SELECT payload FROM xp_transaction WHERE json_extract(payload, '$.occurredAt') >= ? AND json_extract(payload, '$.occurredAt') < ? ORDER BY json_extract(payload, '$.occurredAt'), rowid").all(start, end).map(row => Object.freeze(JSON.parse(String(row.payload)) as XpTransaction))),
      append: async entry => {
        if (!Number.isSafeInteger(entry.amount) || entry.amount === 0 || !Number.isSafeInteger(entry.occurredAt) || !entry.reason.trim() || !entry.actorId.trim()) throw new Error('Invalid transaction');
        return this.transaction(() => {
          const result = this.db.prepare('INSERT INTO xp_transaction (id, member_id, source, source_id, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run(entry.id, entry.memberId, entry.source, entry.sourceId, JSON.stringify(entry));
          if (!result.changes) return false;
          this.db.prepare('INSERT INTO xp_balance VALUES (?, ?) ON CONFLICT(member_id) DO UPDATE SET amount = amount + excluded.amount').run(entry.memberId, entry.amount);
          return true;
        });
      },
      list: async memberId => Object.freeze(this.db.prepare('SELECT payload FROM xp_transaction WHERE member_id = ? ORDER BY rowid').all(memberId).map(row => Object.freeze(JSON.parse(String(row.payload)) as XpTransaction)))
    };
    this.audit = {
      record: async event => { this.db.prepare('INSERT INTO audit_log (payload) VALUES (?)').run(JSON.stringify(event)); },
      list: () => this.db.prepare('SELECT payload FROM audit_log ORDER BY id').all().map(row => JSON.parse(String(row.payload)) as AuditEvent)
    };
    this.seenMessages = { claim: async (groupId, messageId, at) => Boolean(this.db.prepare('INSERT INTO seen_message VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(groupId, messageId, at).changes) };
  }

  close(): void { this.db.close(); }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private migrate(): void {
    this.transaction(() => {
      this.db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
      const version = Number(this.db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_version').get()!.version);
      if (version > 1) throw new Error('Unsupported schema version');
      if (version === 1) {
        this.db.exec("CREATE INDEX IF NOT EXISTS xp_occurred_at ON xp_transaction(json_extract(payload, '$.occurredAt'))");
        return;
      }
      this.db.exec(`
        CREATE TABLE member (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE whatsapp_identity (platform_user_id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES member(id));
        CREATE TABLE group_route (group_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE xp_transaction (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(source, source_id));
        CREATE INDEX xp_occurred_at ON xp_transaction(json_extract(payload, '$.occurredAt'));
        CREATE INDEX xp_member ON xp_transaction(member_id);
        CREATE TABLE xp_balance (member_id TEXT PRIMARY KEY, amount INTEGER NOT NULL);
        CREATE TABLE seen_message (group_id TEXT NOT NULL, message_id TEXT NOT NULL, seen_at INTEGER NOT NULL, PRIMARY KEY(group_id, message_id));
        CREATE TABLE audit_log (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TRIGGER xp_no_update BEFORE UPDATE ON xp_transaction BEGIN SELECT RAISE(ABORT, 'Append-only ledger'); END;
        CREATE TRIGGER xp_no_delete BEFORE DELETE ON xp_transaction BEGIN SELECT RAISE(ABORT, 'Append-only ledger'); END;
        CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'Append-only audit'); END;
        CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'Append-only audit'); END;
        INSERT INTO schema_version VALUES (1);
      `);
    });
  }
}
