import type { Clock, WhatsAppAdapter } from '@aerobot/core';
import type { CommunityConfig } from './config.js';
import { sanitizeText } from './text.js';

interface Pending { firstAt: number; names: string[]; total: number }

/**
 * Welcome messages for CHAT groups. Disabled unless `welcome[groupId].enabled` is true.
 * Joins are aggregated per group and rate limited; only sanitized registered names are rendered,
 * never phone numbers or WhatsApp identifiers. Send failures are tolerated (message dropped).
 */
export class WelcomeService {
  private readonly pending = new Map<string, Pending>();
  private readonly lastSentAt = new Map<string, number>();

  constructor(private readonly deps: { adapter: WhatsAppAdapter; clock: Clock; config: CommunityConfig }) {}

  isEnabled(groupId: string): boolean {
    return this.deps.config.chatGroupIds.includes(groupId) && this.deps.config.welcome[groupId]?.enabled === true;
  }

  /** `displayName` is the registered member name, or undefined for unknown participants. */
  onJoin(groupId: string, displayName?: string): void {
    if (!this.isEnabled(groupId)) return;
    const entry = this.pending.get(groupId) ?? { firstAt: this.deps.clock.now(), names: [], total: 0 };
    entry.total++;
    const name = displayName ? sanitizeText(displayName, 30) : '';
    if (name) entry.names.push(name);
    this.pending.set(groupId, entry);
  }

  async tick(): Promise<void> {
    const now = this.deps.clock.now();
    for (const [groupId, entry] of [...this.pending]) {
      const cfg = this.deps.config.welcome[groupId];
      if (!cfg?.enabled) { this.pending.delete(groupId); continue; }
      const last = this.lastSentAt.get(groupId);
      if (now - entry.firstAt < cfg.windowMs || (last !== undefined && now - last < cfg.minIntervalMs)) continue;
      this.pending.delete(groupId);
      this.lastSentAt.set(groupId, now);
      const shown = entry.names.slice(0, cfg.maxNames);
      const hidden = entry.total - shown.length;
      const nomes = shown.length === 0 ? (entry.total === 1 ? 'novo(a) membro' : 'novos membros')
        : hidden > 0 ? `${shown.join(', ')} e mais ${hidden}` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}` : shown[0]!;
      const values: Record<string, string> = { nomes, quantidade: String(entry.total), grupo: sanitizeText(this.deps.config.groupLabels[groupId] ?? 'grupo', 60) };
      const text = cfg.template.replace(/\{(\w+)\}/gu, (_m, key: string) => values[key] ?? '');
      try { await this.deps.adapter.sendMessage(groupId, text); } catch { /* tolerated: welcome is best effort */ }
    }
  }
}
