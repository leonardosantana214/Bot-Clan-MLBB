export type MembershipAction = 'join' | 'leave';
export interface MembershipEvent {
  readonly id: string; readonly groupId: string; readonly participantId: string;
  readonly action: MembershipAction; readonly at: number;
  readonly origin: 'whatsapp' | 'manual';
  /** Aero ID when the participant is registered, otherwise null. */
  readonly memberId: string | null;
  readonly pendingRegistration: boolean;
}
export interface PresenceRecord { readonly groupId: string; readonly participantId: string; readonly state: 'present' | 'left'; readonly at: number }
export interface ReviewCase {
  readonly id: string; readonly participantId: string; readonly memberId: string | null;
  readonly status: 'open' | 'resolved'; readonly openedAt: number;
  readonly resolvedAt: number | null; readonly resolvedBy: string | null; readonly reason: string;
}
export type ModerationKind = 'flood' | 'repeat' | 'link';
/** Never carries message text or raw WhatsApp identifiers. */
export interface ModerationFlag {
  readonly id: string; readonly kind: ModerationKind; readonly groupId: string;
  readonly senderRef: string; readonly memberId: string | null; readonly at: number; readonly detail: string;
}
export interface Warning {
  readonly id: string; readonly memberId: string; readonly reason: string;
  readonly authorId: string; readonly authorName: string; readonly at: number;
}
export type AdminEventType = 'membership' | 'pending-registration' | 'leave-review' | 'moderation';
export type NotificationState = 'registered' | 'queued' | 'sent' | 'confirmed' | 'failed';
export interface NotificationRecord {
  readonly id: string; readonly destination: string; readonly type: AdminEventType; readonly text: string;
  readonly state: NotificationState; readonly attempts: number;
  readonly createdAt: number; readonly updatedAt: number; readonly nextAttemptAt: number; readonly lastError: string | null;
}
export interface AdminEvent { readonly id: string; readonly type: AdminEventType; readonly at: number; readonly line: string }
