import type { Member, GroupRoute, XpTransaction } from '../domain/models.js';
import type { AuditEvent, AuditLog, Clock, GroupRouteRegistry, MemberRepository, WhatsAppAdapter, XpLedger } from '../application/ports.js';
export class InMemoryMemberRepository implements MemberRepository {
  private readonly members = new Map<string, Member>();
  async list(): Promise<readonly Member[]> { return structuredClone([...this.members.values()]); }
  async findByIdentity(identity: string): Promise<Member | undefined> {
    const member = [...this.members.values()].find(value => value.identities.some(id => id.platformUserId === identity));
    return member ? structuredClone(member) : undefined;
  }
  async register(member: Member): Promise<boolean> {
    if (new Set(member.identities.map(id => id.platformUserId)).size !== member.identities.length || this.members.has(member.id) || [...this.members.values()].some(existing => existing.identities.some(id => member.identities.some(candidate => candidate.platformUserId === id.platformUserId)))) return false;
    this.members.set(member.id, structuredClone(member));
    return true;
  }
}
export class InMemoryGroupRouteRegistry implements GroupRouteRegistry {
  private readonly routes: Map<string, GroupRoute>;
  constructor(routes: readonly GroupRoute[] = []) { this.routes = new Map(routes.map(route => [route.platformGroupId, structuredClone(route)])); }
  async find(groupId: string): Promise<GroupRoute | undefined> {
    const route = this.routes.get(groupId);
    return route ? structuredClone(route) : undefined;
  }
}
export class InMemoryXpLedger implements XpLedger {
  private readonly entries: XpTransaction[] = [];
  async append(transaction: XpTransaction): Promise<boolean> {
    if (!Number.isSafeInteger(transaction.amount) || transaction.amount === 0 || !Number.isSafeInteger(transaction.occurredAt) || !transaction.reason.trim() || !transaction.actorId.trim()) throw new Error('Invalid transaction');
    if (this.entries.some(entry => entry.id === transaction.id || (entry.source === transaction.source && entry.sourceId === transaction.sourceId))) return false;
    this.entries.push(Object.freeze({ ...transaction }));
    return true;
  }
  async listInRange(start: number, end: number): Promise<readonly XpTransaction[]> {
    return Object.freeze(this.entries.filter(entry => entry.occurredAt >= start && entry.occurredAt < end).sort((a, b) => a.occurredAt - b.occurredAt).map(entry => Object.freeze({ ...entry })));
  }
  async list(memberId: string): Promise<readonly XpTransaction[]> {
    return Object.freeze(this.entries.filter(entry => entry.memberId === memberId).map(entry => Object.freeze({ ...entry })));
  }
}
export class InMemoryAuditLog implements AuditLog {
  private readonly events: AuditEvent[] = [];
  async record(event: AuditEvent): Promise<void> { this.events.push(Object.freeze({ ...event })); }
  list(): readonly AuditEvent[] { return this.events.map(event => ({ ...event })); }
}
export class SystemClock implements Clock { now(): number { return Date.now(); } }
export class FakeWhatsAppAdapter implements WhatsAppAdapter {
  readonly sent: { groupId: string; text: string }[] = [];
  async sendMessage(groupId: string, text: string): Promise<void> { this.sent.push({ groupId, text }); }
}
