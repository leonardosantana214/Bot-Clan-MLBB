import { calculateLevel, rankByPeriod, rankPeriodBounds } from '@aerobot/core';
import { ControlServer, HttpControlServer, UnsupportedControlOperation, type HostControlPort, type Overview, type RankingPeriod, type ExportDataset, type HostState } from '@aerobot/control-protocol';
import { csv, repositorySource } from '@aerobot/exports';
import type { SqliteStorage } from '@aerobot/storage-sqlite';

export interface ControlAdapter { setPaused(paused: boolean): void; readonly connectionState: string; readonly pendingQueueCount: number; readonly processedPerMinute: number; readonly responsesPaused: boolean; readonly lastConnectedAt: string }
export class HostController implements HostControlPort {
  private readonly started = Date.now();
  constructor(private readonly storage: SqliteStorage, private readonly adapter: ControlAdapter) {}
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
      clanName: 'A3RO B4STA',
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
  const server = new HttpControlServer(protocol, { port, host: bind, origins: (env.AEROBOT_CONTROL_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean) });
  const url = await server.listen();
  return { server, url };
}
