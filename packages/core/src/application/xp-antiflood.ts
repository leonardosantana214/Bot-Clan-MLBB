import type { Clock, IncomingMessage, MemberRepository, XpLedger } from './ports.js';
export interface XpPolicy { enabled: boolean; minIntervalMs: number; dailyCap: number; award: number }
export const defaultXpPolicy: XpPolicy = { enabled: false, minIntervalMs: 60_000, dailyCap: 100, award: 10 };
export class XpAntiflood {
  private readonly seen = new Map<string, Set<string>>();
  private readonly fingerprints = new Map<string, { day: string; texts: Set<string> }>();
  readonly policy: Readonly<XpPolicy>;
  constructor(private readonly members: MemberRepository, private readonly ledger: XpLedger, private readonly clock: Clock, policy: XpPolicy = defaultXpPolicy) {
    if (![policy.minIntervalMs, policy.dailyCap, policy.award].every(Number.isSafeInteger) || policy.minIntervalMs < 0 || policy.dailyCap < 0 || policy.award <= 0) throw new Error('Invalid XP policy');
    this.policy = Object.freeze({ ...policy });
  }
  async process(message: IncomingMessage): Promise<void> {
    if (message.fromMe || !this.policy.enabled || message.text.trim().startsWith('/')) return;
    const ids = this.seen.get(message.groupId) ?? new Set<string>();
    this.seen.set(message.groupId, ids);
    if (ids.has(message.id)) return;
    ids.add(message.id);
    const member = await this.members.findByIdentity(message.senderId);
    if (!member || member.status !== 'active') return;
    const now = this.clock.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const entries = (await this.ledger.list(member.id)).filter(entry => entry.source === 'message');
    const today = entries.filter(entry => new Date(entry.occurredAt).toISOString().slice(0, 10) === day);
    const latest = entries.reduce((last, entry) => Math.max(last, entry.occurredAt), -Infinity);
    const earned = today.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0);
    if (now - latest < this.policy.minIntervalMs || earned >= this.policy.dailyCap) return;
    const normalized = message.text.trim().replace(/\s+/gu, ' ').toLowerCase();
    if (!normalized) return;
    // Keep only a fingerprint, never message content. Repetition window: UTC day.
    let hash = 2166136261;
    for (const char of normalized) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const fingerprint = `${normalized.length}:${hash}`;
    const state = this.fingerprints.get(member.id);
    const texts = state?.day === day ? state.texts : new Set<string>();
    if (texts.has(fingerprint)) return;
    const appended = await this.ledger.append({ id: `message:${JSON.stringify([message.groupId, message.id])}`, memberId: member.id, amount: Math.min(this.policy.award, this.policy.dailyCap - earned), occurredAt: now, source: 'message', sourceId: JSON.stringify([message.groupId, message.id]), actorId: 'system', reason: 'Synthetic message activity (explicit opt-in)' });
    if (appended) { texts.add(fingerprint); this.fingerprints.set(member.id, { day, texts }); }
  }
}
