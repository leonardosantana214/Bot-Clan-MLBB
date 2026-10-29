import type { Clock, IncomingMessage, MemberRepository, XpLedger } from './ports.js';
export interface XpPolicy { enabled: boolean; minIntervalMs: number; dailyCap: number; award: number }
export const defaultXpPolicy: XpPolicy = { enabled: false, minIntervalMs: 60_000, dailyCap: 100, award: 10 };
export class XpAntiflood {
  private readonly fingerprints = new Map<string, { day: string; texts: Set<string> }>();
  readonly policy: Readonly<XpPolicy>;
  constructor(private readonly members: MemberRepository, private readonly ledger: XpLedger, private readonly clock: Clock, policy: XpPolicy = defaultXpPolicy) {
    XpAntiflood.validatePolicy(policy);
    this.policy = Object.freeze({ ...policy });
  }
  static validatePolicy(policy: XpPolicy): void {
    if (![policy.minIntervalMs, policy.dailyCap, policy.award].every(Number.isSafeInteger) || policy.minIntervalMs < 0 || policy.dailyCap < 0 || policy.award <= 0) throw new Error('Invalid XP policy');
  }
  async process(message: IncomingMessage): Promise<void> {
    if (message.fromMe || !this.policy.enabled || message.text.trim().startsWith('/')) return;
    const member = await this.members.findByIdentity(message.senderId);
    if (!member || member.status !== 'active') return;
    const now = this.clock.now();
    const day = saoPauloDay(now);
    const entries = (await this.ledger.list(member.id)).filter(entry => entry.source === 'message');
    const today = entries.filter(entry => saoPauloDay(entry.occurredAt) === day);
    const latest = entries.reduce((last, entry) => Math.max(last, entry.occurredAt), -Infinity);
    const earned = today.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0);
    if (now - latest < this.policy.minIntervalMs || earned >= this.policy.dailyCap) return;
    const normalized = message.text.trim().replace(/\s+/gu, ' ').toLowerCase();
    if (!normalized) return;
    // Keep only a fingerprint, never message content. Repetition window: Sao Paulo day.
    let hash = 2166136261;
    for (const char of normalized) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const fingerprint = `${normalized.length}:${hash}`;
    for (const [id, state] of this.fingerprints) if (state.day !== day) this.fingerprints.delete(id);
    const state = this.fingerprints.get(member.id);
    const texts = state?.day === day ? state.texts : new Set<string>();
    if (texts.has(fingerprint)) return;
    const appended = await this.ledger.append({ id: `message:${JSON.stringify([message.groupId, message.id])}`, memberId: member.id, amount: Math.min(this.policy.award, this.policy.dailyCap - earned), occurredAt: now, source: 'message', sourceId: JSON.stringify([message.groupId, message.id]), actorId: 'system', reason: 'Synthetic message activity (explicit opt-in)' });
    if (appended) { texts.add(fingerprint); if (texts.size > 10_000) texts.delete(texts.values().next().value!); if (this.fingerprints.size >= 10_000) this.fingerprints.delete(this.fingerprints.keys().next().value!); this.fingerprints.set(member.id, { day, texts }); }
  }
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export function saoPauloDay(at: number): string { return dayFormatter.format(at); }
