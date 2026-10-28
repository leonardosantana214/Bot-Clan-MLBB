import { XpSettingsSchema } from '@aerobot/control-protocol';
import { ControlRuntime } from './control-runtime.js';
import { join } from 'node:path';
import { createBot, displayName, defaultXpPolicy, defaultLevelFormula, calculateLevel, Persona, personaAdapter, type PersonaStyle, type LevelFormula, type XpPolicy, type Clock, type CommandDefinition, type IncomingMessage, type ObservableWhatsAppAdapter, type WhatsAppAdapter } from '@aerobot/core';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { StarMember, SqliteStarRepository, createStarCommands } from '@aerobot/star-member';
import { createCommunity, createCommunityCommands, SqliteCommunityStore, SqliteLevelEvents } from '@aerobot/community';
import { createAdminCommands } from '@aerobot/maintenance';

export interface HostOptions {
  adapter: WhatsAppAdapter;
  xpPolicy?: XpPolicy;
  levelFormula?: LevelFormula;
  persona?: PersonaStyle;
  sessionDir: string;
  groupId?: string;
  adminGroupId?: string;
  backupDir?: string;
  getPassphrase?: () => string | undefined;
  extraCommands?: readonly CommandDefinition[];
  clock?: Clock;
  log?: (message: string) => void;
}

export function composeHost(options: HostOptions) {
  const { groupId, adminGroupId } = options;
  const adapter = personaAdapter(options.adapter, new Persona(options.persona ?? 'neutro'));
  const formula = options.levelFormula ?? defaultLevelFormula;
  if (adminGroupId && adminGroupId === groupId) throw new Error('ADM and CHAT groups must be distinct');
  const log = options.log ?? (message => { process.stderr.write(`${message}\n`); });
  if (!adminGroupId) log('AEROBOT_ADMIN_GROUP ausente: comandos administrativos e notificacoes desligados.');
  const clock = options.clock ?? { now: Date.now };
  const dbPath = join(options.sessionDir, 'bot.sqlite');
  const storage = new SqliteStorage(dbPath);
  const controlRuntime = new ControlRuntime(options.sessionDir, { xpSystem: options.xpPolicy?.enabled === true });
  controlRuntime.set('activeRoles',{...(groupId ? {chatGroupId:groupId}:{}),...(adminGroupId ? {adminGroupId}: {})});
  let levelEvents: SqliteLevelEvents;
  try { levelEvents = new SqliteLevelEvents(dbPath, formula); } catch (error) { storage.close(); throw error; }
  const levelLedger = levelEvents.wrap(storage.ledger, formula);
  const ledger = { ...levelLedger, append: async (entry: Parameters<typeof levelLedger.append>[0]) => {
    const appended = await levelLedger.append(entry);
    if (!appended || !groupId || (options.adapter as { responsesPaused?: boolean }).responsesPaused || controlRuntime.get('maintenance', false)) return appended;
    const event = (await levelEvents.list(entry.memberId, entry.occurredAt, entry.occurredAt + 1)).find(e => e.transactionId === entry.id);
    if (!event) return appended;
    const member = (await storage.members.list?.())?.find(m => m.id === entry.memberId);
    // Untrusted display names must not expose platform identities or phone numbers.
    const name = displayName(member?.name ?? '');
    const remaining = Math.ceil(formula.baseXp * (calculateLevel(event.totalXp, formula) + 1) ** formula.exponent) - event.totalXp;
    try { await adapter.sendMessage(groupId, `Parabéns, ${name}! Nível ${event.newLevel}. Faltam ${remaining} XP para o próximo nível.`); } catch { log('Level notification unavailable'); }
    return appended;
  } };
  Object.defineProperty(storage, 'ledger', { value: ledger });
  let starStore: SqliteStarRepository | undefined;
  let communityStore: SqliteCommunityStore | undefined;
  try {
    starStore = new SqliteStarRepository(dbPath);
    communityStore = new SqliteCommunityStore(dbPath);
    const star = createStarCommands(new StarMember({ repository: starStore, members: storage.members, clock }));
    const community = adminGroupId && groupId ? createCommunity({
      config: { adminGroupId, chatGroupIds: [groupId], welcome: { [groupId]: { enabled: true } } }, store: communityStore,
      adapter: { sendMessage: async (destination, text) => {
        // Also guard queued reports persisted under a previous ADM configuration.
        if (destination !== adminGroupId && !(destination === groupId && controlRuntime.modules(groupId).welcome && !controlRuntime.get('maintenance',false))) throw new Error('Inactive destination');
        await adapter.sendMessage(destination, text);
      } }, members: storage.members, clock
    }) : undefined;
    if(community) {
      const queueWelcome=community.welcome.onJoin.bind(community.welcome);
      community.welcome.onJoin=(group,name)=>{if(controlRuntime.modules(group).welcome && !controlRuntime.get('maintenance',false)) queueWelcome(group,name);};
    }
    // With no ADM route, only the own-warning command is exposed; no notifier is constructed.
    const communityCommands = community ?? createCommunityCommands({ store: communityStore, clock, adminGroupId: adminGroupId ?? '' });
    const memberCommands = [...star.memberCommands, ...communityCommands.memberCommands];
    // Definitions remain known when ADM is disabled; route allow-lists still hide and deny them.
    const adminCommands = [...star.adminCommands, ...communityCommands.adminCommands, ...createAdminCommands(() => ({
      dbPath, backupDir: options.backupDir ?? join(options.sessionDir, 'backups'), clock, log,
      ...(options.getPassphrase ? { getPassphrase: options.getPassphrase } : {})
    }))];
    const common = ['ping', 'ajuda', 'registrar', 'perfil', 'xp', 'rank', 'top'];
    const routes = [
      ...(groupId ? [{ platformGroupId: groupId, allowedCommands: [...common, ...memberCommands.map(c => c.name), ...(options.extraCommands ?? []).map(c => c.name)] }] : []),
      ...(adminGroupId ? [{ platformGroupId: adminGroupId, allowedCommands: [...common, ...adminCommands.map(c => c.name)] }] : [])
    ];
    // Do not trust persisted routes from an earlier host configuration.
    const controlledLedger = { ...ledger, append: async (entry: Parameters<typeof storage.ledger.append>[0]) => {
      if (entry.source === 'message') {
        let group: unknown; try { group = (JSON.parse(entry.sourceId) as unknown[])[0]; } catch { return false; }
        if (typeof group !== 'string' || !controlRuntime.modules(group).xpSystem) return false;
      }
      return ledger.append(entry);
    } };
    const persistedXp = controlRuntime.get<unknown>('xpPolicy', undefined);
    const xpPolicy = persistedXp === undefined ? (options.xpPolicy ?? defaultXpPolicy) : XpSettingsSchema.parse(persistedXp);
    let commandContext: {name:string;group:string;logged:boolean}|undefined;
    const controlledAdapter = { sendMessage: async (group: string, text: string) => {
      if(controlRuntime.get('maintenance',false) && group !== adminGroupId) throw new Error('Manutenção ativa.');
      try { await adapter.sendMessage(group,text); if(commandContext) { controlRuntime.command(commandContext.name,group,clock.now(),text.startsWith('Argumentos inválidos')?'error':'success'); commandContext.logged=true; } }
      catch(error) { if(commandContext) {controlRuntime.command(commandContext.name,group,clock.now(),'error');commandContext.logged=true;} throw error; }
    } };
    const bot = createBot({ ...storage, levelFormula: formula, xpPolicy, ledger: controlledLedger, adapter: controlledAdapter, clock, routes: { find: async id => routes.find(r => r.platformGroupId === id) },
      extraCommands: [...(options.extraCommands ?? []), ...memberCommands, ...adminCommands] });
    let pending = Promise.resolve();
    let stopped = false;
    const enqueue = (work: () => Promise<void>) => {
      if (!stopped) pending = pending.then(work).catch(() => { log('Host processing failed'); });
    };
    const receive = async (message: IncomingMessage) => {
      if (stopped || message.fromMe) return;
      controlRuntime.count(message, clock.now());
      if (!routes.some(r => r.platformGroupId === message.groupId)) return;
      const roles = controlRuntime.get<{ adminGroupId?: string }>('activeRoles', {});
      const isAdmin = message.groupId === (adminGroupId ?? roles.adminGroupId);
      if (controlRuntime.get('maintenance', false) && !isAdmin) return;
      const modules = controlRuntime.modules(message.groupId);
      const command = /^\/([a-z][a-z0-9]*)\b/i.exec(message.text.trim())?.[1]?.toLowerCase();
      if (!modules.mlbbCommands && command && ['heroi','meta','counter'].includes(command)) return;
      if (modules.antiSpam) await community?.moderation.onMessage(message);
      commandContext = command ? {name:command,group:message.groupId,logged:false} : undefined;
      try { await bot.receive(message); }
      catch(error) { if(commandContext && !commandContext.logged) controlRuntime.command(commandContext.name,message.groupId,clock.now(),'error'); throw error; }
      finally { commandContext=undefined; }
    };
    // Events come from the raw adapter: the persona wrapper only decorates outgoing text.
    const observable = options.adapter as Partial<ObservableWhatsAppAdapter>;
    const receiptAdapter=options.adapter as typeof options.adapter & {onReceivedMessage?(handler:(event:{id:string;groupId:string})=>void):()=>void};
    const offReceipt=receiptAdapter.onReceivedMessage?.call(options.adapter,event=>{enqueue(async()=>{controlRuntime.count({...event,senderId:'',text:'',fromMe:false},clock.now());});});
    const offMessage = observable.onMessage?.call(options.adapter, message => { enqueue(() => receive(message)); });
    const offMembership = community ? observable.onMembershipChange?.call(options.adapter, event => { enqueue(async () => { await community.membership.onMembershipChange(event); }); }) : undefined;
    const timer = community ? setInterval(() => { enqueue(() => community.tick()); }, 15_000) : undefined;
    let closing: Promise<void> | undefined;
    return { storage, levelEvents, receive, async idle() { await pending; }, close(): Promise<void> {
      return closing ??= (async () => {
        stopped = true;
        if (timer) clearInterval(timer);
        offReceipt?.(); offMessage?.(); offMembership?.();
        await pending;
        controlRuntime.close(); communityStore?.close(); starStore?.close(); levelEvents.close(); storage.close();
      })();
    } };
  } catch (error) {
    controlRuntime.close(); communityStore?.close(); starStore?.close(); storage.close(); throw error;
  }
}
