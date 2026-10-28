import { join } from 'node:path';
import { createBot, type Clock, type CommandDefinition, type IncomingMessage, type ObservableWhatsAppAdapter, type WhatsAppAdapter } from '@aerobot/core';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { StarMember, SqliteStarRepository, createStarCommands } from '@aerobot/star-member';
import { createCommunity, createCommunityCommands, SqliteCommunityStore } from '@aerobot/community';
import { createAdminCommands } from '@aerobot/maintenance';

export interface HostOptions {
  adapter: WhatsAppAdapter;
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
  const { adapter, groupId, adminGroupId } = options;
  if (adminGroupId && adminGroupId === groupId) throw new Error('ADM and CHAT groups must be distinct');
  const log = options.log ?? (message => { process.stderr.write(`${message}\n`); });
  if (!adminGroupId) log('AEROBOT_ADMIN_GROUP ausente: comandos administrativos e notificacoes desligados.');
  const clock = options.clock ?? { now: Date.now };
  const dbPath = join(options.sessionDir, 'bot.sqlite');
  const storage = new SqliteStorage(dbPath);
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
    const adminCommands = adminGroupId ? [...star.adminCommands, ...communityCommands.adminCommands, ...createAdminCommands(() => ({
      dbPath, backupDir: options.backupDir ?? join(options.sessionDir, 'backups'), clock, log,
      ...(options.getPassphrase ? { getPassphrase: options.getPassphrase } : {})
    }))] : [];
    const common = ['ping', 'ajuda', 'registrar', 'perfil', 'xp', 'rank', 'top'];
    const routes = [
      ...(groupId ? [{ platformGroupId: groupId, allowedCommands: [...common, ...memberCommands.map(c => c.name), ...(options.extraCommands ?? []).map(c => c.name)] }] : []),
      ...(adminGroupId ? [{ platformGroupId: adminGroupId, allowedCommands: [...common, ...adminCommands.map(c => c.name)] }] : [])
    ];
    // Do not trust persisted routes from an earlier host configuration.
    const bot = createBot({ ...storage, adapter, clock, routes: { find: async id => routes.find(r => r.platformGroupId === id) },
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
    const observable = adapter as Partial<ObservableWhatsAppAdapter>;
    const offMessage = observable.onMessage?.call(adapter, message => { enqueue(() => receive(message)); });
    const offMembership = community ? observable.onMembershipChange?.call(adapter, event => { enqueue(async () => { await community.membership.onMembershipChange(event); }); }) : undefined;
    const timer = community ? setInterval(() => { enqueue(() => community.tick()); }, 15_000) : undefined;
    let closing: Promise<void> | undefined;
    return { storage, receive, async idle() { await pending; }, close(): Promise<void> {
      return closing ??= (async () => {
        stopped = true;
        if (timer) clearInterval(timer);
        offMessage?.(); offMembership?.();
        await pending;
        communityStore?.close(); starStore?.close(); storage.close();
      })();
    } };
  } catch (error) {
    communityStore?.close(); starStore?.close(); storage.close(); throw error;
  }
}
