import type { Clock, MemberRepository, ObservableWhatsAppAdapter, WhatsAppAdapter } from '@aerobot/core';
import { createCommunityCommands, type CommunityCommands } from './commands.js';
import { parseCommunityConfig, type CommunityConfigInput } from './config.js';
import { CommunityService } from './membership.js';
import { ModerationService } from './moderation.js';
import { AdminNotificationService } from './notifications.js';
import type { CommunityStore } from './ports.js';
import type { IdGenerator } from './text.js';
import { WelcomeService } from './welcome.js';

export * from './types.js';
export * from './ports.js';
export * from './config.js';
export { InMemoryCommunityStore } from './memory-store.js';
export { SqliteCommunityStore } from './sqlite-store.js';
export { AdminNotificationService } from './notifications.js';
export { CommunityService, type MembershipResult } from './membership.js';
export { WelcomeService } from './welcome.js';
export { ModerationService } from './moderation.js';
export { createCommunityCommands, type CommunityCommands, type CommunityCommandsDeps } from './commands.js';
export { sanitizeText, shortHash } from './text.js';

export interface CommunityDeps {
  config: CommunityConfigInput; store: CommunityStore; adapter: WhatsAppAdapter; members: MemberRepository; clock: Clock; newId?: IdGenerator;
}

/** Wires every service. `tick()` must be called periodically (e.g. every 10-30 s) by the host. */
export function createCommunity(deps: CommunityDeps): CommunityCommands & {
  readonly membership: CommunityService; readonly moderation: ModerationService;
  readonly notifications: AdminNotificationService; readonly welcome: WelcomeService;
  tick(): Promise<void>;
  /** Subscribes to adapter events; returns an unsubscribe function. */
  attach(adapter: ObservableWhatsAppAdapter): () => void;
} {
  const config = parseCommunityConfig(deps.config);
  const base = { store: deps.store, clock: deps.clock, ...(deps.newId ? { newId: deps.newId } : {}) };
  const notifications = new AdminNotificationService({ ...base, adapter: deps.adapter, config });
  const welcome = new WelcomeService({ adapter: deps.adapter, clock: deps.clock, config });
  const membership = new CommunityService({ ...base, members: deps.members, notifier: notifications, config, welcome });
  const moderation = new ModerationService({ ...base, members: deps.members, notifier: notifications, config });
  const commands = createCommunityCommands({ ...base, adminGroupId: config.adminGroupId, notifier: notifications });
  return {
    ...commands, membership, moderation, notifications, welcome,
    async tick() { await welcome.tick(); await notifications.tick(); },
    attach(adapter) {
      const offMembership = adapter.onMembershipChange(event => { void membership.onMembershipChange(event).catch(() => undefined); });
      const offMessage = adapter.onMessage(message => { void moderation.onMessage(message).catch(() => undefined); });
      return () => { offMembership(); offMessage(); };
    }
  };
}
