import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Member, XpTransaction, AuditEvent, XpLedger } from '@aerobot/core';

export interface ExportSnapshot { members: readonly Member[]; xpTransactions: readonly XpTransaction[]; auditLog: readonly AuditEvent[] }
export interface ExportSource { snapshot(): Promise<ExportSnapshot> }
/** Compose core repositories with the enumeration capabilities absent from core. */
export function repositorySource(members: { list(): Promise<readonly Member[]> }, ledger: XpLedger, audit: { list(): Promise<readonly AuditEvent[]> }): ExportSource {
  return { snapshot: async () => { const all = await members.list(); return { members: all, xpTransactions: (await Promise.all(all.map(m => ledger.list(m.id)))).flat(), auditLog: await audit.list() }; } };
}
/** Reads the storage-sqlite v1 payload schema in a single consistent transaction. */
export class SqliteExportSource implements ExportSource {
  constructor(private readonly path: string) {}
  async snapshot(): Promise<ExportSnapshot> {
    const db = new DatabaseSync(this.path, { readOnly: true });
    try {
      db.exec('BEGIN');
      if (db.prepare('SELECT MAX(version) AS version FROM schema_version').get()?.version !== 1) throw new Error('Unsupported SQLite schema');
      const read = <T>(table: string, order: string): T[] => db.prepare(`SELECT payload FROM ${table} ORDER BY ${order}`).all().map(row => JSON.parse(String(row.payload)) as T);
      const result = { members: read<Member>('member', 'id'), xpTransactions: read<XpTransaction>('xp_transaction', 'id'), auditLog: read<AuditEvent>('audit_log', 'id') };
      db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
}
export const HEADERS_V1 = {
  members: ['schema_version', 'member_id', 'name', 'status', 'registered_at', 'whatsapp_identifiers'],
  xp_transactions: ['schema_version', 'transaction_id', 'member_id', 'amount', 'occurred_at', 'source', 'source_id', 'actor_id', 'reason'],
  audit_log: ['schema_version', 'action', 'actor_id', 'occurred_at', 'subject_id'],
  rankings: ['schema_version', 'period_start', 'period_end_exclusive', 'rank', 'member_id', 'xp']
} as const;
export function csvCell(value: unknown, separator: ',' | ';' = ','): string {
  let text = String(value ?? '');
  // Only strings can carry formulas; real finite numbers (e.g. XP delta -5) must stay numeric for Power BI.
  if (!(typeof value === 'number' && Number.isFinite(value)) && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function csv(rows: readonly (readonly unknown[])[], separator: ',' | ';' = ','): string {
  return '\uFEFF' + rows.map(row => row.map(cell => csvCell(cell, separator)).join(separator)).join('\r\n') + '\r\n';
}
export function maskIdentity(identity: string): string { return identity.length <= 4 ? '****' : '*'.repeat(Math.max(4, identity.length - 4)) + identity.slice(-4); }
export function saoPauloDate(timestamp: number): string {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  const offset = part('timeZoneName').replace('GMT', '').replace('\u2212', '-') || '+00:00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${String(date.getUTCMilliseconds()).padStart(3, '0')}${offset}`;
}
export async function atomicWrite(path: string, content: string): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, content, { flag: 'wx', mode: 0o600 }); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}
export interface ExportOptions { outputFolder?: string; separator?: ',' | ';'; fullWhatsAppIdentifiers?: boolean; period: { start: string; endExclusive: string } }
/** Period boundaries are local calendar days; inclusive start, exclusive end. */
export async function exportCsv(source: ExportSource, options: ExportOptions): Promise<string[]> {
  const { start, endExclusive } = options.period;
  const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  if (!validDay(start) || !validDay(endExclusive) || start >= endExclusive) throw new Error('Invalid day period');
  const snapshot = await source.snapshot();
  const totals = new Map<string, number>();
  for (const tx of snapshot.xpTransactions) { const day = saoPauloDate(tx.occurredAt).slice(0, 10); if (day >= start && day < endExclusive) totals.set(tx.memberId, (totals.get(tx.memberId) ?? 0) + tx.amount); }
  const rankings = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'));
  const rows = {
    members: snapshot.members.map(m => [1, m.id, m.name, m.status, saoPauloDate(m.registeredAt), m.identities.map(i => options.fullWhatsAppIdentifiers ? i.platformUserId : maskIdentity(i.platformUserId)).join('|')]),
    xp_transactions: snapshot.xpTransactions.map(t => [1, t.id, t.memberId, t.amount, saoPauloDate(t.occurredAt), t.source, t.sourceId, t.actorId, t.reason]),
    audit_log: snapshot.auditLog.map(a => [1, a.action, a.actorId, saoPauloDate(a.at), a.subjectId]),
    rankings: rankings.map(([id, xp], index) => [1, start, endExclusive, index + 1, id, xp])
  };
  const folder = options.outputFolder ?? join(homedir(), '.aerobot', 'exports');
  await mkdir(folder, { recursive: true });
  const paths: string[] = [];
  for (const key of Object.keys(rows) as (keyof typeof rows)[]) { const path = join(folder, `${key}_v1.csv`); await atomicWrite(path, csv([HEADERS_V1[key], ...rows[key]], options.separator)); paths.push(path); }
  return paths;
}

/** Counts CSV records without treating embedded quoted newlines as rows. */
export function csvDataRows(content: string): number {
  let quoted=false,records=0;
  for(let i=0;i<content.length;i++) { const c=content[i]; if(c==='"') { if(quoted && content[i+1]==='"') i++; else quoted=!quoted; } else if(c==='\n' && !quoted) records++; }
  return Math.max(0,records-1);
}
export interface LeadershipDatasetsV1 {
  warnings: readonly (readonly unknown[])[];
  starScores: readonly (readonly unknown[])[];
  scout: readonly (readonly unknown[])[];
}
export const LEADERSHIP_HEADERS_V1 = {
  warnings: ['schema_version','warning_id','member_id','at'],
  starScores: ['schema_version','period','member_id','category','points','at'],
  scout: ['schema_version','candidate_id','name','status','roles','rank','stage','evaluation']
} as const;
/** Rows use stable dimension keys; callers omit private notes and account identifiers. */
export async function exportLeadershipCsv(folder: string, data: LeadershipDatasetsV1): Promise<string[]> {
  await mkdir(folder,{recursive:true,mode:0o700});
  const names={warnings:'warnings_v1.csv',starScores:'star_scores_v1.csv',scout:'scout_v1.csv'};
  const paths:string[]=[];
  for(const key of Object.keys(names) as (keyof typeof names)[]) {const path=join(folder,names[key]);await atomicWrite(path,csv([LEADERSHIP_HEADERS_V1[key],...data[key]]));paths.push(path);}
  return paths;
}

/** Optional level_events integration. Caller supplies only verified domain events. */
export async function exportLevelUpsCsv(folder: string, rows: readonly (readonly unknown[])[]): Promise<string> {
  const path=join(folder,'level_ups_v1.csv');
  await atomicWrite(path,csv([['schema_version','event_id','member_id','occurred_at','previous_level','new_level'],...rows]));
  return path;
}
