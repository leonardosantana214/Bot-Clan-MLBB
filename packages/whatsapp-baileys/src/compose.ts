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
  let levelEvents: SqliteLevelEvents;
  try { levelEvents = new SqliteLevelEvents(dbPath, formula); } catch (error) { storage.close(); throw error; }
  const levelLedger = levelEvents.wrap(storage.ledger, formula);
  const ledger = { ...levelLedger, append: async (entry: Parameters<typeof levelLedger.append>[0]) => {
    const appended = await levelLedger.append(entry);
    if (!appended || !groupId || (options.adapter as { responsesPaused?: boolean }).responsesPaused) return appended;
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
      config: { adminGroupId, chatGroupIds: [groupId] }, store: communityStore,
      adapter: { sendMessage: async (destination, text) => {
        // Also guard queued reports persisted under a previous ADM configuration.
        if (destination !== adminGroupId) throw new Error('Inactive administration destination');
        await adapter.sendMessage(destination, text);
      } }, members: storage.members, clock
    }) : undefined;
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
    const bot = createBot({ ...storage, ledger, adapter, clock, levelFormula: formula, xpPolicy: options.xpPolicy ?? defaultXpPolicy, routes: { find: async id => routes.find(r => r.platformGroupId === id) },
      extraCommands: [...(options.extraCommands ?? []), ...memberCommands, ...adminCommands] });
    let pending = Promise.resolve();
    let stopped = false;
    const enqueue = (work: () => Promise<void>) => {
      if (!stopped) pending = pending.then(work).catch(() => { log('Host processing failed'); });
    };
    const receive = async (message: IncomingMessage) => {
      if (stopped || !routes.some(r => r.platformGroupId === message.groupId)) return;
      await community?.moderation.onMessage(message);
      await bot.receive(message);
    };
    const observable = options.adapter as Partial<ObservableWhatsAppAdapter>;
    const offMessage = observable.onMessage?.call(options.adapter, message => { enqueue(() => receive(message)); });
    const offMembership = community ? observable.onMembershipChange?.call(options.adapter, event => { enqueue(async () => { await community.membership.onMembershipChange(event); }); }) : undefined;
    const timer = community ? setInterval(() => { enqueue(() => community.tick()); }, 15_000) : undefined;
    let closing: Promise<void> | undefined;
    return { storage, levelEvents, receive, async idle() { await pending; }, close(): Promise<void> {
      return closing ??= (async () => {
        stopped = true;
        if (timer) clearInterval(timer);
        offMessage?.(); offMembership?.();
        await pending;
        communityStore?.close(); starStore?.close(); levelEvents.close(); storage.close();
      })();
    } };
  } catch (error) {
    communityStore?.close(); starStore?.close(); levelEvents.close(); storage.close(); throw error;
  }
}
