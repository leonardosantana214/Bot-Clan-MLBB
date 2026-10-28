import type { GroupRoles } from './api';
import { ControlClient, ControlClientError, HttpTransport } from '@aerobot/control-protocol/browser';
import type { ControllerApi, ModuleKey, ExportDataset, BotSettings, XpRankEntry, SimulationMode } from './api';
import type { AuthProvider, AuthSession, AuthResult } from './auth';

export function remoteError(error: unknown): string {
  if (error instanceof ControlClientError) {
    if (error.code === 'insecure_network' || error.code === 'invalid_groups') return error.message;
    if (error.code === 'unsupported') return 'Indisponível: operação não suportada neste Host.';
    if (error.code === 'invalid_credentials') return 'Senha inválida.';
    if (error.code === 'unauthenticated' || error.code === 'not_logged_in') return 'Sessão expirada. Entre novamente.';
    if (error.code === 'rate_limited') return 'Muitas tentativas. Aguarde e tente novamente.';
    if (error.code === 'transport') return 'Não foi possível conectar ao Host. Verifique endereço, rede e origens permitidas.';
  }
  return 'Não foi possível concluir a operação no Host.';
}
export class RemoteControllerApi implements ControllerApi {
  constructor(readonly client: ControlClient) {}
  private async run<T>(work: () => Promise<T>): Promise<T> { try { return await work(); } catch (error) { throw new Error(remoteError(error)); } }
  getConnection() { return this.run(() => this.client.getConnection()); }
  startPairing() { return this.run(() => this.client.startPairing()); }
  disconnectSession(confirm: true) { return this.run(() => this.client.disconnectSession(confirm)); }
  listWhatsAppGroups() { return this.run(() => this.client.listWhatsAppGroups()); }
  setGroupRoles(roles: GroupRoles) { return this.run(() => this.client.setGroupRoles(roles)); }
  getSimulationMode(): SimulationMode { return 'normal'; }
  setSimulationMode(): void { throw new Error('Simulação indisponível no modo real.'); }
  getOverview() { return this.run(() => this.client.getOverview()); }
  getHostState() { return this.run(() => this.client.getHostState()); }
  setResponsesPaused(paused: boolean) { return this.run(() => this.client.setResponsesPaused(paused)); }
  setMaintenanceMode(enabled: boolean) { return this.run(() => this.client.setMaintenanceMode(enabled)); }
  getGroups() { return this.run(() => this.client.listGroups()); }
  toggleGroupModule(id: string, key: ModuleKey, enabled: boolean) { return this.run(() => this.client.setGroupModules(id, { [key]: enabled })); }
  getXpRanking(): Promise<XpRankEntry[]> { return this.run(async () => (await this.client.getRanking('all_time')).map(r => ({ ...r, mlbbRole: 'Indisponível', mythicTier: 'Indisponível', nextLevelXp: 100 * (r.level + 1) ** 2, streakDays: null }))); }
  exportCsv(dataset: ExportDataset) { return this.run(() => this.client.requestExport(dataset)); }
  async getSettings(): Promise<BotSettings> { throw new Error('Indisponível: configurações não suportadas pelo protocolo.'); }
  async updateSettings(): Promise<BotSettings> { throw new Error('Indisponível: configurações não suportadas pelo protocolo.'); }
}
export class RemoteAuthProvider implements AuthProvider {
  private session: AuthSession | null = null;
  constructor(readonly client: ControlClient) {}
  async login(password: string): Promise<AuthResult> {
    try { await this.client.login(password); this.session = { adminAlias: 'ADM', authenticatedAt: new Date().toISOString() }; return { ok: true, session: this.session }; }
    catch (error) { return { ok: false, errorMessage: remoteError(error) }; }
  }
  async logout(): Promise<void> { try { await this.client.logout(); } catch { /* Local logout must always work offline. */ } finally { this.session = null; } }
  async getSession() { return this.client.isLoggedIn ? this.session : null; }
}
export function createRemote(address: string, onSessionExpired: () => void) {
  const client = new ControlClient(new HttpTransport(address), { onSessionExpired });
  return { api: new RemoteControllerApi(client), auth: new RemoteAuthProvider(client) };
}
