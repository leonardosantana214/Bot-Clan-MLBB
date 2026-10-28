import type { WhatsAppConnection, WhatsAppGroup, GroupRoles, GroupRolesResult } from '@aerobot/control-protocol/browser';
export type { WhatsAppConnection, WhatsAppGroup, GroupRoles, GroupRolesResult } from '@aerobot/control-protocol/browser';

export type HostConnectionStatus = 'online' | 'degraded' | 'offline';

export interface OverviewStats {
  totalMembers: number;
  activeToday: number;
  messagesToday: number;
  hostStatus: HostConnectionStatus;
  clanName: string;
  seasonLabel: string;
}

export interface HostState {
  status: HostConnectionStatus;
  instanceAlias: string;
  lastConnectedAt: string;
  uptimeLabel: string;
  pendingQueueCount: number;
  processedPerMinute: number;
  responsesPaused: boolean;
  maintenanceMode: boolean;
}

export type ModuleKey = 'welcome' | 'xpSystem' | 'mlbbCommands' | 'antiSpam' | 'scrimAlerts';

export interface GroupModules {
  welcome: boolean;
  xpSystem: boolean;
  mlbbCommands: boolean;
  antiSpam: boolean;
  scrimAlerts: boolean;
}

export interface GroupRoute {
  id: string;
  name: string;
  routeTag: string;
  memberCount: number;
  dailyMessages: number;
  modules: GroupModules;
}

export interface XpRankEntry {
  rank: number;
  memberId: string;
  nickname: string;
  mlbbRole: string;
  mythicTier: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  messagesSent: number;
  streakDays: number | null;
}

export type ExportDataset = 'xp_ranking' | 'clan_members' | 'command_logs' | 'moderation_audit';

export interface ExportReceipt {
  dataset: ExportDataset;
  fileName: string;
  rowCount: number;
  generatedAt: string;
  previewCsv: string;
}

export interface BotSettings {
  commandPrefix: string;
  xpPerMessage: number;
  xpCooldownSeconds: number;
  maintenanceAutoReply: string;
  dailyDigestEnabled: boolean;
  strictAntiLink: boolean;
}

export type SimulationMode = 'normal' | 'empty' | 'error';

/**
 * Contrato da camada de dados da interface AERO.
 * Isola toda a UI de detalhes de transporte para futura substituição por cliente HTTP/WebSocket real.
 */
export interface ControllerApi {
  getConnection(): Promise<WhatsAppConnection>;
  startPairing(): Promise<{ started: boolean }>;
  disconnectSession(confirm: true): Promise<{ disconnected: boolean }>;
  listWhatsAppGroups(): Promise<WhatsAppGroup[]>;
  setGroupRoles(roles: GroupRoles): Promise<GroupRolesResult>;
  getSimulationMode(): SimulationMode;
  setSimulationMode(mode: SimulationMode): void;
  getOverview(): Promise<OverviewStats>;
  getHostState(): Promise<HostState>;
  setResponsesPaused(paused: boolean): Promise<HostState>;
  setMaintenanceMode(enabled: boolean): Promise<HostState>;
  getGroups(): Promise<GroupRoute[]>;
  toggleGroupModule(groupId: string, moduleKey: ModuleKey, enabled: boolean): Promise<GroupRoute>;
  getXpRanking(): Promise<XpRankEntry[]>;
  exportCsv(dataset: ExportDataset): Promise<ExportReceipt>;
  getSettings(): Promise<BotSettings>;
  updateSettings(patch: Partial<BotSettings>): Promise<BotSettings>;
}

const INITIAL_HOST_STATE: HostState = {
  status: 'online',
  instanceAlias: 'NODE-BR-SP01 (WhatsApp Bridge)',
  lastConnectedAt: 'Hoje às 13:25 (há 5 min)',
  uptimeLabel: '14d 06h 42m',
  pendingQueueCount: 3,
  processedPerMinute: 28,
  responsesPaused: false,
  maintenanceMode: false
};

const INITIAL_GROUPS: GroupRoute[] = [
  {
    id: 'grp-main-lobby',
    name: 'CHAT',
    routeTag: 'rota://chat',
    memberCount: 94,
    dailyMessages: 1420,
    modules: {
      welcome: true,
      xpSystem: true,
      mlbbCommands: true,
      antiSpam: true,
      scrimAlerts: true
    }
  },
  {
    id: 'grp-scrims',
    name: 'PARTIDAS',
    routeTag: 'rota://partidas',
    memberCount: 35,
    dailyMessages: 610,
    modules: {
      welcome: false,
      xpSystem: true,
      mlbbCommands: true,
      antiSpam: true,
      scrimAlerts: true
    }
  },
  {
    id: 'grp-announcements',
    name: 'Announcements',
    routeTag: 'rota://announcements',
    memberCount: 128,
    dailyMessages: 45,
    modules: {
      welcome: true,
      xpSystem: false,
      mlbbCommands: false,
      antiSpam: true,
      scrimAlerts: true
    }
  },
  {
    id: 'grp-academy',
    name: 'ENCONTRE SEU(SUA) DUO',
    routeTag: 'rota://duo',
    memberCount: 62,
    dailyMessages: 390,
    modules: {
      welcome: true,
      xpSystem: true,
      mlbbCommands: true,
      antiSpam: true,
      scrimAlerts: false
    }
  }
];

const INITIAL_RANKING: XpRankEntry[] = [
  {
    rank: 1,
    memberId: 'mbr-001',
    nickname: 'KaguraMain_BR',
    mlbbRole: 'Mid Laner',
    mythicTier: 'Mítico Imortal 112★',
    level: 42,
    xp: 18450,
    nextLevelXp: 20000,
    messagesSent: 1940,
    streakDays: 29
  },
  {
    rank: 2,
    memberId: 'mbr-002',
    nickname: 'Hayabusa_Shadow',
    mlbbRole: 'Jungler',
    mythicTier: 'Mítico Imortal 104★',
    level: 39,
    xp: 16210,
    nextLevelXp: 17500,
    messagesSent: 1715,
    streakDays: 24
  },
  {
    rank: 3,
    memberId: 'mbr-003',
    nickname: 'Tigreal_Frontline',
    mlbbRole: 'Roamer',
    mythicTier: 'Mítico Glória 78★',
    level: 36,
    xp: 14800,
    nextLevelXp: 16000,
    messagesSent: 1532,
    streakDays: 19
  },
  {
    rank: 4,
    memberId: 'mbr-004',
    nickname: 'BeatrixSniperX',
    mlbbRole: 'Gold Laner',
    mythicTier: 'Mítico Glória 64★',
    level: 33,
    xp: 12940,
    nextLevelXp: 14000,
    messagesSent: 1288,
    streakDays: 15
  },
  {
    rank: 5,
    memberId: 'mbr-005',
    nickname: 'YuZhong_Dragon',
    mlbbRole: 'EXP Laner',
    mythicTier: 'Mítico Glória 55★',
    level: 31,
    xp: 11320,
    nextLevelXp: 12500,
    messagesSent: 1104,
    streakDays: 12
  },
  {
    rank: 6,
    memberId: 'mbr-006',
    nickname: 'FannyCables99',
    mlbbRole: 'Jungler',
    mythicTier: 'Mítico Honra 38★',
    level: 28,
    xp: 9450,
    nextLevelXp: 10500,
    messagesSent: 920,
    streakDays: 9
  }
];

const INITIAL_SETTINGS: BotSettings = {
  commandPrefix: '!',
  xpPerMessage: 15,
  xpCooldownSeconds: 45,
  maintenanceAutoReply: '[AeroBot] O bot do clã está em manutenção programada para atualização de temporada.',
  dailyDigestEnabled: true,
  strictAntiLink: true
};

export class MockControllerApi implements ControllerApi {
  private pairingStarted = 0;
  private disconnected = false;
  private roles: GroupRoles = {};
  async getConnection(): Promise<WhatsAppConnection> {
    this.ensureNotError();
    if (this.disconnected) return { state: 'sessao_encerrada', demonstration: true };
    if (!this.pairingStarted) return { state: 'desconectado', demonstration: true };
    if (Date.now() - this.pairingStarted > 15_000) return { state: 'conectado', botName: 'Bot DEMONSTRAÇÃO', demonstration: true };
    return { state: 'aguardando_qr', qr: `DEMONSTRAÇÃO NÃO ESCANEÁVEL ${Math.floor(Date.now() / 5000)}`, expiresAt: (Math.floor(Date.now() / 5000) + 1) * 5000, demonstration: true };
  }
  async startPairing() { this.ensureNotError(); this.pairingStarted = Date.now(); this.disconnected = false; return { started: true }; }
  async disconnectSession(confirm: true) { if (confirm !== true) throw new Error('Confirmação obrigatória'); this.disconnected = true; this.pairingStarted = 0; return { disconnected: true }; }
  async listWhatsAppGroups(): Promise<WhatsAppGroup[]> { return (await this.getConnection()).state === 'conectado' ? [{ id: 'demo-chat@g.us', name: 'CHAT — DEMONSTRAÇÃO' }, { id: 'demo-adm@g.us', name: 'ADM — DEMONSTRAÇÃO' }] : []; }
  async setGroupRoles(patch: GroupRoles): Promise<GroupRolesResult> {
    const roles = { ...this.roles, ...patch }, groups = await this.listWhatsAppGroups();
    if ((roles.chatGroupId && !groups.some(g => g.id === roles.chatGroupId)) || (roles.adminGroupId && !groups.some(g => g.id === roles.adminGroupId)) || (roles.chatGroupId && roles.chatGroupId === roles.adminGroupId)) throw new Error('Escolha grupos conhecidos e distintos.');
    this.roles = roles;
    return { ...roles, restartRequired: false, message: 'DEMONSTRAÇÃO: papéis simulados.' };
  }
  private mode: SimulationMode = 'normal';
  private hostState: HostState = { ...INITIAL_HOST_STATE };
  private groups: GroupRoute[] = INITIAL_GROUPS.map((g) => ({
    ...g,
    modules: { ...g.modules }
  }));
  private ranking: XpRankEntry[] = INITIAL_RANKING.map((r) => ({ ...r }));
  private settings: BotSettings = { ...INITIAL_SETTINGS };

  public getSimulationMode(): SimulationMode {
    return this.mode;
  }

  public setSimulationMode(mode: SimulationMode): void {
    this.mode = mode;
  }

  private ensureNotError(): void {
    if (this.mode === 'error') {
      throw new Error('Falha simulada de comunicação com o Host local (Modo de Teste de Erro ativo).');
    }
  }

  public async getOverview(): Promise<OverviewStats> {
    this.ensureNotError();
    if (this.mode === 'empty') {
      return {
        totalMembers: 0,
        activeToday: 0,
        messagesToday: 0,
        hostStatus: 'offline',
        clanName: 'AERO',
        seasonLabel: 'Temporada S34 • Sem dados sincronizados'
      };
    }

    return {
      totalMembers: 128,
      activeToday: 47,
      messagesToday: 2465,
      hostStatus: this.hostState.status,
      clanName: 'AERO',
      seasonLabel: 'Temporada S34 • Divisão Mítica'
    };
  }

  public async getHostState(): Promise<HostState> {
    this.ensureNotError();
    return { ...this.hostState };
  }

  public async setResponsesPaused(paused: boolean): Promise<HostState> {
    this.ensureNotError();
    this.hostState = {
      ...this.hostState,
      responsesPaused: paused,
      pendingQueueCount: paused ? this.hostState.pendingQueueCount + 5 : 2
    };
    return { ...this.hostState };
  }

  public async setMaintenanceMode(enabled: boolean): Promise<HostState> {
    this.ensureNotError();
    this.hostState = {
      ...this.hostState,
      maintenanceMode: enabled,
      status: enabled ? 'degraded' : 'online',
      responsesPaused: enabled ? true : this.hostState.responsesPaused
    };
    return { ...this.hostState };
  }

  public async getGroups(): Promise<GroupRoute[]> {
    this.ensureNotError();
    if (this.mode === 'empty') {
      return [];
    }
    return this.groups.map((g) => ({
      ...g,
      modules: { ...g.modules }
    }));
  }

  public async toggleGroupModule(
    groupId: string,
    moduleKey: ModuleKey,
    enabled: boolean
  ): Promise<GroupRoute> {
    this.ensureNotError();
    const index = this.groups.findIndex((g) => g.id === groupId);
    const target = this.groups[index];
    if (index === -1 || !target) {
      throw new Error('Grupo não encontrado na configuração sintética.');
    }

    const updated: GroupRoute = {
      ...target,
      modules: {
        ...target.modules,
        [moduleKey]: enabled
      }
    };
    this.groups[index] = updated;
    return {
      ...updated,
      modules: { ...updated.modules }
    };
  }

  public async getXpRanking(): Promise<XpRankEntry[]> {
    this.ensureNotError();
    if (this.mode === 'empty') {
      return [];
    }
    return this.ranking.map((r) => ({ ...r }));
  }

  public async exportCsv(dataset: ExportDataset): Promise<ExportReceipt> {
    this.ensureNotError();

    const metaMap: Record<ExportDataset, { fileName: string; rowCount: number; previewCsv: string }> = {
      xp_ranking: {
        fileName: 'aerobot_ranking_xp_s34_mock.csv',
        rowCount: this.ranking.length,
        previewCsv: [
          'rank,member_id,nickname,role,level,xp',
          ...this.ranking.slice(0, 3).map((r) => `${r.rank},${r.memberId},${r.nickname},${r.mlbbRole},${r.level},${r.xp}`)
        ].join('\n')
      },
      clan_members: {
        fileName: 'aerobot_membros_cla_mock.csv',
        rowCount: 128,
        previewCsv: [
          'member_id,nickname,elo_mlbb,status_cla',
          'mbr-001,KaguraMain_BR,Mitico Imortal,Ativo',
          'mbr-002,Hayabusa_Shadow,Mitico Imortal,Ativo',
          'mbr-003,Tigreal_Frontline,Mitico Gloria,Ativo'
        ].join('\n')
      },
      command_logs: {
        fileName: 'aerobot_logs_comandos_mock.csv',
        rowCount: 412,
        previewCsv: [
          'timestamp,rota,comando,autor_id,status',
          '2026-10-28T13:20:00Z,rota://chat,!rank,mbr-001,OK',
          '2026-10-28T13:22:15Z,rota://partidas,!scrim,mbr-002,OK'
        ].join('\n')
      },
      moderation_audit: {
        fileName: 'aerobot_auditoria_moderacao_mock.csv',
        rowCount: 19,
        previewCsv: [
          'timestamp,acao,responsavel,detalhe',
          '2026-10-28T11:05:00Z,ANTI_SPAM_WARN,AeroBot,Flood de figurinhas bloqueado no CHAT',
          '2026-10-28T12:40:00Z,PAUSE_TOGGLE,ADM,Fila inspecionada manualmente'
        ].join('\n')
      }
    };

    const selected = metaMap[dataset];
    return {
      dataset,
      fileName: selected.fileName,
      rowCount: selected.rowCount,
      generatedAt: '28/10/2026 às 13:30 (Mock Sintético)',
      previewCsv: selected.previewCsv
    };
  }

  public async getSettings(): Promise<BotSettings> {
    this.ensureNotError();
    return { ...this.settings };
  }

  public async updateSettings(patch: Partial<BotSettings>): Promise<BotSettings> {
    this.ensureNotError();
    this.settings = {
      ...this.settings,
      ...patch
    };
    return { ...this.settings };
  }
}

export const defaultControllerApi: ControllerApi = new MockControllerApi();
