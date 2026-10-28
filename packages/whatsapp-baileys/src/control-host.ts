import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { GroupRolesSchema, InvalidGroupRoles, type GroupRoles, type WhatsAppConnection, type WhatsAppGroup } from '@aerobot/control-protocol';
import { calculateLevel, rankByPeriod, rankPeriodBounds } from '@aerobot/core';
import { ControlServer, HttpControlServer, UnsupportedControlOperation, type HostControlPort, type Overview, type RankingPeriod, type ExportDataset, type HostState } from '@aerobot/control-protocol';
import { csv, repositorySource } from '@aerobot/exports';
import type { SqliteStorage } from '@aerobot/storage-sqlite';

const execute = promisify(execFile);
let windowsSid: Promise<string> | undefined;
async function restrictConfigFile(path: string): Promise<void> {
  await chmod(path, 0o600);
  if (process.platform !== 'win32') return;
  // chmod alone does not restrict NTFS ACLs. Resolve our SID locally, never via a shell interpolation.
  windowsSid ??= execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { windowsHide: true, timeout: 10_000 }).then(({ stdout }) => {
    const sid = stdout.trim();
    if (!/^S-\d-(?:\d+-)+\d+$/.test(sid)) throw new Error('Cannot identify configuration owner');
    return sid;
  });
  await execute('icacls.exe', [path, '/inheritance:r', '/grant:r', `*${await windowsSid}:(F)`], { windowsHide: true, timeout: 10_000 });
}

export async function readGroupRoles(sessionDir: string): Promise<GroupRoles> {
  try { return GroupRolesSchema.parse(JSON.parse(await readFile(join(sessionDir, 'group-roles.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw new Error('Configuração de grupos inválida.'); }
}
export interface ControlAdapter {
  readonly sessionDir?: string;
  readonly connectionSnapshot?: WhatsAppConnection;
  startPairing?(): Promise<void>;
  logoutSession?(): Promise<void>;
  listWhatsAppGroups?(): Promise<WhatsAppGroup[]>; setPaused(paused: boolean): void; readonly connectionState: string; readonly pendingQueueCount: number; readonly processedPerMinute: number; readonly responsesPaused: boolean; readonly lastConnectedAt: string }
export class HostController implements HostControlPort {
  private readonly started = Date.now();
  constructor(private readonly storage: SqliteStorage, private readonly adapter: ControlAdapter) {}
  async getConnection(): Promise<WhatsAppConnection> { return this.adapter.connectionSnapshot ?? { state: 'desconectado' }; }
  async startPairing() { if (!this.adapter.startPairing) throw new UnsupportedControlOperation(); await this.adapter.startPairing(); return { started: true }; }
  async disconnectSession() { if (!this.adapter.logoutSession) throw new UnsupportedControlOperation(); await this.adapter.logoutSession(); return { disconnected: true }; }
  async listWhatsAppGroups() { return this.adapter.listWhatsAppGroups ? this.adapter.listWhatsAppGroups() : []; }
  private roleWrite = Promise.resolve();
  async setGroupRoles(patch: GroupRoles) {
    const sessionDir = this.adapter.sessionDir;
    if (!sessionDir) throw new UnsupportedControlOperation();
    let result: GroupRoles = {};
    const work = this.roleWrite.then(async () => {
      const roles = { ...await readGroupRoles(sessionDir), ...patch };
      const groups = await this.listWhatsAppGroups();
      if ((roles.chatGroupId && !groups.some(g => g.id === roles.chatGroupId)) || (roles.adminGroupId && !groups.some(g => g.id === roles.adminGroupId)) || (roles.chatGroupId && roles.chatGroupId === roles.adminGroupId)) throw new InvalidGroupRoles();
      const path = join(sessionDir, 'group-roles.json');
      await writeFile(`${path}.tmp`, JSON.stringify(roles), { mode: 0o600 });
      await restrictConfigFile(`${path}.tmp`); await rename(`${path}.tmp`, path);
      result = roles;
    });
    this.roleWrite = work.catch(() => undefined); await work;
    return { ...result, restartRequired: true, message: 'Papéis salvos: reinicie o Host. Variáveis de ambiente têm prioridade.' };
  }
  /** `messagesToday` conta eventos que geraram XP hoje (o Host não registra o total de mensagens). */
  async getOverview(): Promise<Overview> {
    const members = (await this.storage.members.list?.()) ?? [];
    const now = Date.now();
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
    const dayStart = Date.parse(`${ymd}T00:00:00-03:00`);
    const today = (await this.storage.ledger.listInRange?.(dayStart, dayStart + 86_400_000)) ?? [];
    const state = await this.getHostState();
    return {
      totalMembers: members.filter(m => m.status === 'active' || m.status === 'inactive').length,
      activeToday: new Set(today.map(t => t.memberId)).size,
      messagesToday: today.length,
      hostStatus: state.status,
      clanName: 'AERO',
      seasonLabel: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(now)
    };
  }
  async getHostState(): Promise<HostState> {
    return { status: this.adapter.connectionState === 'open' ? 'online' : 'offline', instanceAlias: 'WhatsApp Host', lastConnectedAt: this.adapter.lastConnectedAt, uptimeLabel: `${Math.floor((Date.now() - this.started) / 1000)}s`, pendingQueueCount: this.adapter.pendingQueueCount, processedPerMinute: this.adapter.processedPerMinute, responsesPaused: this.adapter.responsesPaused, maintenanceMode: false };
  }
  async setResponsesPaused(paused: boolean) { this.adapter.setPaused(paused); return this.getHostState(); }
  async setMaintenanceMode(enabled: boolean): Promise<never> { void enabled; throw new UnsupportedControlOperation(); }
  async listGroups(): Promise<never> { throw new UnsupportedControlOperation(); }
  async setGroupModules(): Promise<never> { throw new UnsupportedControlOperation(); }
  async getRanking(period: RankingPeriod) {
    if (period === 'daily') throw new UnsupportedControlOperation();
    const bounds = rankPeriodBounds(period === 'weekly' ? 'semana' : period === 'monthly' ? 'mes' : 'geral', Date.now());
    const rows = await rankByPeriod(this.storage.members, this.storage.ledger, bounds.start, bounds.end);
    return Promise.all(rows.map(async r => ({ rank: r.position, memberId: r.member.id, nickname: r.member.name, level: calculateLevel((await this.storage.ledger.list(r.member.id)).reduce((sum, tx) => sum + tx.amount, 0)), xp: r.xp, messagesSent: (await this.storage.ledger.list(r.member.id)).filter(tx => tx.source === 'message' && tx.occurredAt >= bounds.start && tx.occurredAt < bounds.end).length })));
  }
  async requestExport(dataset: ExportDataset) {
    if (dataset === 'command_logs') throw new UnsupportedControlOperation();
    const snapshot = await repositorySource({ list: () => this.storage.members.list!() }, this.storage.ledger, { list: async () => this.storage.audit.list() }).snapshot();
    const rows = dataset === 'clan_members' ? snapshot.members.map(m => [m.id, m.name, m.status]) : dataset === 'moderation_audit' ? snapshot.auditLog.map(a => [a.action, a.actorId, a.at, a.subjectId]) : (await this.getRanking('all_time')).map(r => [r.rank, r.memberId, r.nickname, r.xp]);
    const header = dataset === 'clan_members' ? ['id', 'nome', 'status'] : dataset === 'moderation_audit' ? ['acao', 'ator', 'instante', 'alvo'] : ['posicao', 'id', 'nome', 'xp'];
    return { dataset, fileName: `${dataset}.csv`, rowCount: rows.length, generatedAt: new Date().toISOString(), previewCsv: csv([header, ...rows]).slice(0, 8192) };
  }
}
export async function startControlServer(storage: SqliteStorage, adapter: ControlAdapter, env: NodeJS.ProcessEnv = process.env) {
  if (!env.AEROBOT_CONTROL_PORT || !env.AEROBOT_ADMIN_PASSWORD_HASH) return undefined;
  const port = Number(env.AEROBOT_CONTROL_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('AEROBOT_CONTROL_PORT inválida.');
  const bind = env.AEROBOT_CONTROL_HOST ?? '127.0.0.1';
  if (bind !== '127.0.0.1' && bind !== '0.0.0.0') throw new Error('AEROBOT_CONTROL_HOST inválido.');
  const protocol = new ControlServer({ host: new HostController(storage, adapter), adminPasswordHash: env.AEROBOT_ADMIN_PASSWORD_HASH, audit: storage.audit, clock: { now: Date.now } });
  const server = new HttpControlServer(protocol, { port, host: bind, trustNetwork: env.AEROBOT_CONTROL_TRUST_NETWORK === '1', origins: (env.AEROBOT_CONTROL_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean) });
  const url = await server.listen();
  return { server, url };
}
