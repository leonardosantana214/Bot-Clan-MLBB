import type { AdminEvent, MembershipEvent, ModerationFlag, NotificationRecord, NotificationState, PresenceRecord, ReviewCase, Warning } from './types.js';

export interface MembershipEventFilter { readonly groupId?: string; readonly participantId?: string }
export interface NotificationPatch {
  readonly state: NotificationState; readonly attempts?: number; readonly updatedAt: number;
  readonly nextAttemptAt?: number; readonly lastError?: string | null;
}

/**
 * Persistence port. Membership events, moderation flags and warnings are append-only ledgers
 * (no update/delete). Presence, review cases and notifications are mutable state.
 * No message content is ever stored.
 */
export interface CommunityStore {
  appendMembershipEvent(event: MembershipEvent): Promise<boolean>;
  listMembershipEvents(filter?: MembershipEventFilter): Promise<readonly MembershipEvent[]>;
  setPresence(record: PresenceRecord): Promise<void>;
  getPresence(participantId: string): Promise<readonly PresenceRecord[]>;
  /** Returns false when an open case already exists for the participant. */
  openReviewCase(reviewCase: ReviewCase): Promise<boolean>;
  listReviewCases(status?: ReviewCase['status']): Promise<readonly ReviewCase[]>;
  resolveReviewCase(id: string, at: number, by: string): Promise<boolean>;
  appendFlag(flag: ModerationFlag): Promise<boolean>;
  listFlags(groupId?: string): Promise<readonly ModerationFlag[]>;
  appendWarning(warning: Warning): Promise<boolean>;
  listWarnings(memberId: string): Promise<readonly Warning[]>;
  /** Idempotency key (event, destination). False when already claimed. */
  claimNotificationEvent(eventId: string, destination: string): Promise<boolean>;
  saveNotification(record: NotificationRecord): Promise<boolean>;
  updateNotification(id: string, patch: NotificationPatch): Promise<void>;
  listNotifications(state?: NotificationState): Promise<readonly NotificationRecord[]>;
}

/** Aggregating, idempotent channel to the administration group. */
export interface NotificationGateway {
  notify(event: AdminEvent): Promise<void>;
  /** Flushes due aggregation windows and processes the send queue. Call periodically. */
  tick(): Promise<void>;
}
