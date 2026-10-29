import { createHash } from 'node:crypto';
import { ControlRuntime, localDay } from './control-runtime.js';
import { LeadershipHost, type LevelEventsPort } from './leadership-host.js';
import type { LeadershipQuery, LeadershipAction } from '@aerobot/control-protocol';
import { readFile, writeFile, rename, chmod, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { GroupRolesSchema, InvalidGroupRoles, type GroupRoles, type WhatsAppConnection, type WhatsAppGroup } from '@aerobot/control-protocol';
import { displayName, levelProgress, progressionConfiguration, rankByPeriod, rankPeriodBounds, type LevelFormula } from '@aerobot/core';
import { ControlServer, HttpControlServer, hashPassword, UnsupportedControlOperation, type HostControlPort, type Overview, type RankingPeriod, type ExportDataset, type HostState } from '@aerobot/control-protocol';
import { csv, repositorySource, atomicWrite } from '@aerobot/exports';
import type { SqliteStorage } from '@aerobot/storage-sqlite';

const safeKey = (id: string) => 'm_'+createHash('sha256').update(id).digest('hex').slice(0,24);
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
  readonly levelEvents?: LevelEventsPort;
  readonly sessionDir?: string;
  readonly connectionSnapshot?: WhatsAppConnection;
  startPairing?(): Promise<void>;
  logoutSession?(): Promise<void>;
  listWhatsAppGroups?(): Promise<WhatsAppGroup[]>; setPaused(paused: boolean): void; readonly connectionState: string; readonly pendingQueueCount: number; readonly processedPerMinute: number; readonly responsesPaused: boolean; readonly lastConnectedAt: string }
export class HostController implements HostControlPort {
  private readonly started = Date.now();
  private runtimeStore: ControlRuntime | undefined;
  private leadershipStore: LeadershipHost | undefined;
  constructor(private readonly storage: SqliteStorage, private readonly adapter: ControlAdapter, private readonly env: NodeJS.ProcessEnv = process.env, private readonly formula: LevelFormula = progressionConfiguration(env).levelFormula, private readonly levelEvents = adapter.levelEvents) {}
  private get runtime() { if(!this.runtimeStore && this.adapter.sessionDir) this.runtimeStore=new ControlRuntime(this.adapter.sessionDir); return this.runtimeStore; }
  private get leadership() { if(!this.leadershipStore && this.adapter.sessionDir) this.leadershipStore=new LeadershipHost(this.storage,this.adapter.sessionDir,this.env,this.levelEvents,this.formula); return this.leadershipStore; }
  close() { this.leadershipStore?.close(); this.runtimeStore?.close(); }
  leadershipQuery(query: LeadershipQuery) { if(!this.leadership) throw new UnsupportedControlOperation(); return this.leadership.query(query); }
  leadershipAction(action: LeadershipAction, actor: string) { if(!this.leadership) throw new UnsupportedControlOperation(); return this.leadership.action(action,actor); }
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
      messagesToday: this.runtime?.today() ?? 0,
      hostStatus: state.status,
      clanName: 'AERO',
      seasonLabel: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(now)
    };
  }
  async getHostState(): Promise<HostState> {
    return { status: this.adapter.connectionState === 'open' ? 'online' : 'offline', instanceAlias: 'WhatsApp Host', lastConnectedAt: this.adapter.lastConnectedAt, uptimeLabel: `${Math.floor((Date.now() - this.started) / 1000)}s`, pendingQueueCount: this.adapter.pendingQueueCount, processedPerMinute: this.adapter.processedPerMinute, responsesPaused: this.adapter.responsesPaused, maintenanceMode: this.runtime?.get('maintenance', false) ?? false };
  }
  async setResponsesPaused(paused: boolean) { this.adapter.setPaused(paused); return this.getHostState(); }
  async setMaintenanceMode(enabled: boolean) { if(!this.runtime) throw new UnsupportedControlOperation(); this.runtime.set('maintenance',enabled); if(enabled && !this.adapter.responsesPaused) {this.adapter.setPaused(true);this.adapter.setPaused(false);} return this.getHostState(); }
  async listGroups() {
    if(!this.runtime) throw new UnsupportedControlOperation();
    const roles=this.runtime.get<GroupRoles>('activeRoles',await readGroupRoles(this.adapter.sessionDir!));
    return (await this.listWhatsAppGroups()).map(g => ({ id:g.id,name:g.name,routeTag:g.id === (this.env.AEROBOT_ADMIN_GROUP ?? roles.adminGroupId) ? 'ADM' : g.id === (this.env.AEROBOT_TEST_GROUP ?? roles.chatGroupId) ? 'CHAT' : 'Sem rota ativa',memberCount:g.memberCount ?? null,dailyMessages:this.runtime!.today(g.id),modules:this.runtime!.modules(g.id) }));
  }
  async setGroupModules(groupId: string, modules: import('@aerobot/control-protocol').GroupModulesPatch) {
    const group=(await this.listGroups()).find(g => g.id === groupId);
    if(!group) return undefined;
    if(group.routeTag === 'Sem rota ativa' || modules.scrimAlerts === true || (group.routeTag === 'ADM' && (modules.welcome === true || modules.mlbbCommands === true))) throw new UnsupportedControlOperation();
    this.runtime!.patch(groupId,modules); return (await this.listGroups()).find(g => g.id === groupId);
  }
  async getRanking(period: RankingPeriod) {
    const dayStart=Date.parse(`${localDay()}T00:00:00-03:00`);
    const bounds = period === 'daily' ? {start:dayStart,end:dayStart+86_400_000} : rankPeriodBounds(period === 'weekly' ? 'semana' : period === 'monthly' ? 'mes' : 'geral', Date.now());
    const rows = await rankByPeriod(this.storage.members, this.storage.ledger, bounds.start, bounds.end);
    return Promise.all(rows.map(async r => {
      const ledger = await this.storage.ledger.list(r.member.id);
      return { rank: r.position, memberId: safeKey(r.member.id), nickname: displayName(r.member.name), ...levelProgress(ledger.reduce((sum, tx) => sum + tx.amount, 0), this.formula), xp: r.xp, messagesSent: ledger.filter(tx => tx.source === 'message' && tx.occurredAt >= bounds.start && tx.occurredAt < bounds.end).length };
    }));
  }
  async requestExport(dataset: ExportDataset) {
    if (dataset === 'command_logs') {
      if(!this.runtime) throw new UnsupportedControlOperation();
      const logs=this.runtime.db.prepare('SELECT command,group_id,at,outcome FROM control_commands ORDER BY id').all();
      return this.exportReceipt(dataset,'command_logs_v1.csv',logs.length,csv([['schema_version','command','group_id','at','outcome'],...logs.map(r=>[1,r.command,safeKey(String(r.group_id)),r.at,r.outcome])]));
    }
    const snapshot = await repositorySource({ list: () => this.storage.members.list!() }, this.storage.ledger, { list: async () => this.storage.audit.list() }).snapshot();
    const rows = dataset === 'clan_members' ? snapshot.members.map(m => [safeKey(m.id), displayName(m.name), m.status]) : dataset === 'moderation_audit' ? snapshot.auditLog.map(a => [a.action, safeKey(a.actorId), a.at, safeKey(a.subjectId)]) : (await this.getRanking('all_time')).map(r => [r.rank, r.memberId, r.nickname, r.xp]);
    const header = dataset === 'clan_members' ? ['id', 'nome', 'status'] : dataset === 'moderation_audit' ? ['acao', 'ator', 'instante', 'alvo'] : ['posicao', 'id', 'nome', 'xp'];
    return this.exportReceipt(dataset,`${dataset}_v1.csv`,rows.length,csv([header,...rows]));
  }
  private async exportReceipt(dataset: ExportDataset, fileName: string, rowCount: number, content: string) {
    if(this.adapter.sessionDir) {const folder=this.env.AEROBOT_EXPORT_DIR ?? join(this.adapter.sessionDir,'exports');await mkdir(folder,{recursive:true,mode:0o700});await atomicWrite(join(folder,fileName),content);}
    return {dataset,fileName,rowCount,generatedAt:new Date().toISOString(),previewCsv:content.slice(0,8192)};
  }

}
export async function startControlServer(storage: SqliteStorage, adapter: ControlAdapter, env: NodeJS.ProcessEnv = process.env, integrations: { levelEvents?: LevelEventsPort; levelFormula?: LevelFormula } = {}) {
  if (!env.AEROBOT_CONTROL_PORT) return undefined;
  // Simple setup: AEROBOT_ADMIN_PASSWORD is hashed in memory at start-up (never written anywhere).
  // AEROBOT_ADMIN_PASSWORD_HASH remains supported for operators who prefer to provide a ready hash.
  const adminPasswordHash = env.AEROBOT_ADMIN_PASSWORD_HASH ?? (env.AEROBOT_ADMIN_PASSWORD ? await hashPassword(env.AEROBOT_ADMIN_PASSWORD) : undefined);
  if (!adminPasswordHash) return undefined;
  const port = Number(env.AEROBOT_CONTROL_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('AEROBOT_CONTROL_PORT inválida.');
  const bind = env.AEROBOT_CONTROL_HOST ?? '127.0.0.1';
  if (bind !== '127.0.0.1' && bind !== '0.0.0.0') throw new Error('AEROBOT_CONTROL_HOST inválido.');
  const controller = new HostController(storage, adapter, env, integrations.levelFormula, integrations.levelEvents);
  const protocol = new ControlServer({ host: controller, adminPasswordHash, audit: storage.audit, clock: { now: Date.now } });
  const server = new HttpControlServer(protocol, { port, host: bind, trustNetwork: env.AEROBOT_CONTROL_TRUST_NETWORK === '1', origins: (env.AEROBOT_CONTROL_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean) });
  const url = await server.listen();
  const close = server.close.bind(server);
  server.close = async () => { try { await close(); } finally { controller.close(); } };
  return { server, url };
}
