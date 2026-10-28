import type { Clock, MemberRepository, MembershipChange } from '@aerobot/core';
import type { CommunityConfig } from './config.js';
import type { CommunityStore, NotificationGateway } from './ports.js';
import { defaultIdGenerator, sanitizeText, shortHash, type IdGenerator } from './text.js';
import type { MembershipEvent } from './types.js';
import type { WelcomeService } from './welcome.js';

export interface MembershipResult {
  readonly recorded: boolean; readonly pendingRegistration: boolean; readonly reviewCaseOpened: boolean;
}

export interface CommunityServiceDeps {
  store: CommunityStore; members: MemberRepository; notifier: NotificationGateway; clock: Clock;
  config: CommunityConfig; welcome?: WelcomeService; newId?: IdGenerator;
}

/**
 * Tracks group membership. A single event never deletes a profile nor changes a member status.
 * "Possible community exit" requires leave evidence in EVERY visible group and only opens a
 * review case for ADMs (BR-03); status changes are always a human decision.
 */
export class CommunityService {
  private readonly newId: IdGenerator;
  constructor(private readonly deps: CommunityServiceDeps) { this.newId = deps.newId ?? defaultIdGenerator; }

  /** Registers presence snapshots (e.g. from group metadata) without creating events. */
  async observePresence(groupId: string, participantIds: readonly string[]): Promise<void> {
    if (!this.deps.config.visibleGroupIds.includes(groupId)) return;
    const at = this.deps.clock.now();
    for (const participantId of participantIds) await this.deps.store.setPresence({ groupId, participantId, state: 'present', at });
  }

  async onMembershipChange(change: MembershipChange, origin: MembershipEvent['origin'] = 'whatsapp'): Promise<MembershipResult> {
    const { store, members, notifier, clock, config } = this.deps;
    const ignored = { recorded: false, pendingRegistration: false, reviewCaseOpened: false };
    if (!config.visibleGroupIds.includes(change.groupId)) return ignored;
    const at = clock.now();
    const member = await members.findByIdentity(change.participantId);
    const pendingRegistration = !member && change.action === 'join';
    const event: MembershipEvent = {
      id: this.newId(), groupId: change.groupId, participantId: change.participantId, action: change.action,
      at, origin, memberId: member?.id ?? null, pendingRegistration
    };
    if (!await store.appendMembershipEvent(event)) return ignored;
    await store.setPresence({ groupId: change.groupId, participantId: change.participantId, state: change.action === 'join' ? 'present' : 'left', at });

    const who = member ? sanitizeText(member.name, 40) : `participante não cadastrado (ref ${shortHash(change.participantId)})`;
    const where = this.groupLabel(change.groupId);
    await notifier.notify({ id: event.id, type: 'membership', at, line: `${change.action === 'join' ? 'entrou' : 'saiu'}: ${who} em ${where}` });
    if (pendingRegistration) await notifier.notify({ id: `${event.id}:pending`, type: 'pending-registration', at, line: `${who} entrou em ${where} e precisa de cadastro` });
    if (change.action === 'join') this.deps.welcome?.onJoin(change.groupId, member?.name);

    let reviewCaseOpened = false;
    if (change.action === 'leave' && member && await this.leftEverywhere(change.participantId)) {
      const caseId = this.newId();
      reviewCaseOpened = await store.openReviewCase({
        id: caseId, participantId: change.participantId, memberId: member.id, status: 'open', openedAt: at,
        resolvedAt: null, resolvedBy: null, reason: 'Saída observada em todos os grupos visíveis'
      });
      if (reviewCaseOpened) await notifier.notify({ id: `case:${caseId}`, type: 'leave-review', at, line: `${who}: saída de todos os grupos visíveis; revisar (nenhum status foi alterado)` });
    }
    return { recorded: true, pendingRegistration, reviewCaseOpened };
  }

  private async leftEverywhere(participantId: string): Promise<boolean> {
    const presence = new Map((await this.deps.store.getPresence(participantId)).map(p => [p.groupId, p.state]));
    return this.deps.config.visibleGroupIds.every(groupId => presence.get(groupId) === 'left');
  }

  private groupLabel(groupId: string): string {
    return sanitizeText(this.deps.config.groupLabels[groupId] ?? `grupo ${shortHash(groupId, 4)}`, 60);
  }
}
