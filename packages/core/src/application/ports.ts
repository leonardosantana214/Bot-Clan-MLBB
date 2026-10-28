import type { GroupRoute, Member, XpTransaction } from '../domain/models.js';
export interface IncomingMessage {
  readonly id: string; readonly groupId: string; readonly senderId: string;
  readonly text: string; readonly fromMe: boolean;
}
export interface WhatsAppAdapter { sendMessage(groupId: string, text: string): Promise<void> }
/** Alias retained alongside IncomingMessage for existing consumers. */
export type InboundMessage = IncomingMessage;
export type ConnectionState = 'disconnected' | 'connecting' | 'open' | 'reconnecting' | 'logged-out' | 'forbidden' | 'failed';
export interface MembershipChange {
  readonly groupId: string; readonly participantId: string; readonly action: 'join' | 'leave';
}
/** Optional capability interface: existing send-only adapters remain compatible. */
export interface ObservableWhatsAppAdapter extends WhatsAppAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (message: InboundMessage) => void): () => void;
  onMembershipChange(handler: (event: MembershipChange) => void): () => void;
  onConnectionState(handler: (state: ConnectionState) => void): () => void;
}
export interface MemberRepository {
  findByIdentity(platformUserId: string): Promise<Member | undefined>;
  register(member: Member): Promise<boolean>;
}
export interface GroupRouteRegistry { find(groupId: string): Promise<GroupRoute | undefined> }
export interface XpLedger {
  append(transaction: XpTransaction): Promise<boolean>;
  list(memberId: string): Promise<readonly XpTransaction[]>;
}
export interface Clock { now(): number }
export interface AuditEvent { readonly action: string; readonly actorId: string; readonly at: number; readonly subjectId: string }
export interface AuditLog { record(event: AuditEvent): Promise<void> }

// Atomically claim a group/message pair; false means already processed.
export interface SeenMessageStore { claim(groupId: string, messageId: string, at: number): Promise<boolean> }
