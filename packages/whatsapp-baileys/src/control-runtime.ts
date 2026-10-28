import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { GroupModulesSchema, type GroupModules, type GroupModulesPatch } from '@aerobot/control-protocol';
import type { IncomingMessage } from '@aerobot/core';
export const defaultModules: GroupModules = { welcome: false, xpSystem: false, mlbbCommands: true, antiSpam: true, scrimAlerts: false };
export function localDay(at = Date.now()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(at); }
/** Shared by routing and control through SQLite, independent of core storage migrations. */
export class ControlRuntime {
  readonly db: DatabaseSync;
  constructor(sessionDir: string) {
    this.db = new DatabaseSync(join(sessionDir, 'control.sqlite'));
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_version VALUES(1);
      CREATE TABLE IF NOT EXISTS control_config(key TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS control_daily(group_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(group_id,day));
      CREATE TABLE IF NOT EXISTS control_seen(hash TEXT PRIMARY KEY, day TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS control_commands(id INTEGER PRIMARY KEY, command TEXT NOT NULL, group_id TEXT NOT NULL, at INTEGER NOT NULL, outcome TEXT NOT NULL);`);
  }
  get<T>(key: string, fallback: T): T { const r=this.db.prepare('SELECT payload FROM control_config WHERE key=?').get(key); return r ? JSON.parse(String(r.payload)) as T : fallback; }
  set(key: string, value: unknown) { this.db.prepare('INSERT INTO control_config VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').run(key,JSON.stringify(value)); }
  modules(group: string) { return GroupModulesSchema.parse(this.get('modules:'+group,defaultModules)); }
  patch(group: string, patch: GroupModulesPatch) { const modules=GroupModulesSchema.parse({...this.modules(group),...patch}); this.set('modules:'+group,modules); return modules; }
  count(message: IncomingMessage, at: number) {
    if(message.fromMe) return;
    const hash=createHash('sha256').update(JSON.stringify([message.groupId,message.id])).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try { if(this.db.prepare('INSERT INTO control_seen VALUES (?,?) ON CONFLICT DO NOTHING').run(hash,localDay(at)).changes) this.db.prepare('INSERT INTO control_daily VALUES (?,?,1) ON CONFLICT(group_id,day) DO UPDATE SET count=count+1').run(message.groupId,localDay(at)); this.db.exec('COMMIT'); } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  command(command: string, group: string, at: number, outcome: 'success'|'error') { this.db.prepare('INSERT INTO control_commands(command,group_id,at,outcome) VALUES (?,?,?,?)').run(command,group,at,outcome); }
  today(group?: string) { return Number((group ? this.db.prepare('SELECT COALESCE(SUM(count),0) AS n FROM control_daily WHERE day=? AND group_id=?').get(localDay(),group) : this.db.prepare('SELECT COALESCE(SUM(count),0) AS n FROM control_daily WHERE day=?').get(localDay()))!.n); }
  close() { this.db.close(); }
}
