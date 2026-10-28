import type { CommunityStore, MembershipEventFilter, NotificationPatch } from './ports.js';
import type { MembershipEvent, ModerationFlag, NotificationRecord, NotificationState, PresenceRecord, ReviewCase, Warning } from './types.js';

const freeze = <T extends object>(value: T): T => Object.freeze({ ...value });

export class InMemoryCommunityStore implements CommunityStore {
  private readonly events: MembershipEvent[] = [];
  private readonly presence = new Map<string, PresenceRecord>();
  private readonly cases: ReviewCase[] = [];
  private readonly flags: ModerationFlag[] = [];
  private readonly warnings: Warning[] = [];
  private readonly claims = new Set<string>();
  private readonly notifications = new Map<string, NotificationRecord>();

  async appendMembershipEvent(event: MembershipEvent): Promise<boolean> {
    if (this.events.some(e => e.id === event.id)) return false;
    this.events.push(freeze(event)); return true;
  }
  async listMembershipEvents(filter: MembershipEventFilter = {}): Promise<readonly MembershipEvent[]> {
    return this.events.filter(e => (filter.groupId === undefined || e.groupId === filter.groupId) && (filter.participantId === undefined || e.participantId === filter.participantId));
  }
  async setPresence(record: PresenceRecord): Promise<void> { this.presence.set(`${record.groupId}\u0000${record.participantId}`, freeze(record)); }
  async getPresence(participantId: string): Promise<readonly PresenceRecord[]> {
    return [...this.presence.values()].filter(p => p.participantId === participantId).sort((a, b) => a.groupId.localeCompare(b.groupId));
  }
  async openReviewCase(reviewCase: ReviewCase): Promise<boolean> {
    if (this.cases.some(c => c.id === reviewCase.id || (c.status === 'open' && c.participantId === reviewCase.participantId))) return false;
    this.cases.push(freeze(reviewCase)); return true;
  }
  async listReviewCases(status?: ReviewCase['status']): Promise<readonly ReviewCase[]> { return this.cases.filter(c => status === undefined || c.status === status); }
  async resolveReviewCase(id: string, at: number, by: string): Promise<boolean> {
    const index = this.cases.findIndex(c => c.id === id && c.status === 'open');
    const current = this.cases[index];
    if (!current) return false;
    this.cases[index] = freeze({ ...current, status: 'resolved' as const, resolvedAt: at, resolvedBy: by }); return true;
  }
  async appendFlag(flag: ModerationFlag): Promise<boolean> {
    if (this.flags.some(f => f.id === flag.id)) return false;
    this.flags.push(freeze(flag)); return true;
  }
  async listFlags(groupId?: string): Promise<readonly ModerationFlag[]> { return this.flags.filter(f => groupId === undefined || f.groupId === groupId); }
  async appendWarning(warning: Warning): Promise<boolean> {
    if (this.warnings.some(w => w.id === warning.id)) return false;
    this.warnings.push(freeze(warning)); return true;
  }
  async listWarnings(memberId: string): Promise<readonly Warning[]> { return this.warnings.filter(w => w.memberId === memberId); }
  async claimNotificationEvent(eventId: string, destination: string): Promise<boolean> {
    const key = `${eventId}\u0000${destination}`;
    if (this.claims.has(key)) return false;
    this.claims.add(key); return true;
  }
  async saveNotification(record: NotificationRecord): Promise<boolean> {
    if (this.notifications.has(record.id)) return false;
    this.notifications.set(record.id, freeze(record)); return true;
  }
  async updateNotification(id: string, patch: NotificationPatch): Promise<void> {
    const current = this.notifications.get(id);
    if (!current) return;
    this.notifications.set(id, freeze({ ...current, state: patch.state, attempts: patch.attempts ?? current.attempts, updatedAt: patch.updatedAt, nextAttemptAt: patch.nextAttemptAt ?? current.nextAttemptAt, lastError: patch.lastError === undefined ? current.lastError : patch.lastError }));
  }
  async listNotifications(state?: NotificationState): Promise<readonly NotificationRecord[]> {
    return [...this.notifications.values()].filter(n => state === undefined || n.state === state);
  }
}
