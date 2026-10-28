import type { Clock, IncomingMessage, MemberRepository } from '@aerobot/core';
import type { CommunityConfig } from './config.js';
import type { CommunityStore, NotificationGateway } from './ports.js';
import { BoundedMap, defaultIdGenerator, sanitizeText, shortHash, type IdGenerator } from './text.js';
import type { ModerationFlag, ModerationKind } from './types.js';

export interface ModerationDeps {
  store: CommunityStore; members: MemberRepository; notifier: NotificationGateway; clock: Clock;
  config: CommunityConfig; newId?: IdGenerator;
}

const URL_LIKE = /(?:https?:\/\/|www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#]\S*)?/giu;

/**
 * Assisted moderation: detects flood, repeated messages and suspicious links, records a flag and
 * notifies ADMs. It never blocks, removes or punishes anyone. Only counters and short hashes are
 * kept in bounded in-memory windows; message text is never stored or logged.
 */
export class ModerationService {
  private readonly times: BoundedMap<string, number[]>;
  private readonly hashes: BoundedMap<string, { h: string; at: number }[]>;
  private readonly cooldowns: BoundedMap<string, number>;
  private readonly newId: IdGenerator;

  constructor(private readonly deps: ModerationDeps) {
    const max = deps.config.moderation.maxTracked;
    this.times = new BoundedMap(max); this.hashes = new BoundedMap(max); this.cooldowns = new BoundedMap(max * 3);
    this.newId = deps.newId ?? defaultIdGenerator;
  }

  async onMessage(message: IncomingMessage): Promise<readonly ModerationFlag[]> {
    const { config, clock } = this.deps;
    if (message.fromMe || !config.chatGroupIds.includes(message.groupId)) return [];
    const now = clock.now();
    const key = `${message.groupId}\u0000${message.senderId}`;
    const detections: { kind: ModerationKind; detail: string }[] = [];
    const flood = this.detectFlood(key, now);
    if (flood) detections.push({ kind: 'flood', detail: flood });
    const repeat = this.detectRepeat(key, message.text, now);
    if (repeat) detections.push({ kind: 'repeat', detail: repeat });
    const link = this.detectLink(message.text);
    if (link) detections.push({ kind: 'link', detail: link });

    const flags: ModerationFlag[] = [];
    for (const { kind, detail } of detections) {
      const coolKey = `${kind}\u0000${key}`;
      const last = this.cooldowns.get(coolKey);
      if (last !== undefined && now - last < config.moderation.cooldownMs) continue;
      this.cooldowns.set(coolKey, now);
      flags.push(await this.flag(message, kind, detail, now));
    }
    return flags;
  }

  private async flag(message: IncomingMessage, kind: ModerationKind, detail: string, at: number): Promise<ModerationFlag> {
    const member = await this.deps.members.findByIdentity(message.senderId);
    const flag: ModerationFlag = {
      id: this.newId(), kind, groupId: message.groupId, senderRef: shortHash(message.senderId),
      memberId: member?.id ?? null, at, detail
    };
    await this.deps.store.appendFlag(flag);
    const who = member ? sanitizeText(member.name, 40) : `ref ${flag.senderRef}`;
    const label = { flood: 'flood', repeat: 'mensagens repetidas', link: 'link suspeito' }[kind];
    const group = sanitizeText(this.deps.config.groupLabels[message.groupId] ?? `grupo ${shortHash(message.groupId, 4)}`, 60);
    await this.deps.notifier.notify({ id: flag.id, type: 'moderation', at, line: `${label}: ${who} em ${group} (${detail})` });
    return flag;
  }

  private detectFlood(key: string, now: number): string | undefined {
    const { maxMessages, windowMs } = this.deps.config.moderation.flood;
    const list = (this.times.get(key) ?? []).filter(t => now - t < windowMs);
    list.push(now);
    if (list.length > maxMessages * 2) list.splice(0, list.length - maxMessages * 2);
    this.times.set(key, list);
    return list.length > maxMessages ? `${list.length} mensagens em ${Math.round(windowMs / 1000)}s` : undefined;
  }

  private detectRepeat(key: string, text: string, now: number): string | undefined {
    const { threshold, windowMs, minLength } = this.deps.config.moderation.repeat;
    const normalized = text.toLowerCase().replace(/\s+/gu, ' ').trim();
    if (normalized.length < minLength || normalized.startsWith('/')) return undefined;
    const h = shortHash(normalized, 12);
    const list = (this.hashes.get(key) ?? []).filter(e => now - e.at < windowMs);
    list.push({ h, at: now });
    if (list.length > 20) list.splice(0, list.length - 20);
    this.hashes.set(key, list);
    const count = list.filter(e => e.h === h).length;
    if (count < threshold) return undefined;
    this.hashes.set(key, list.filter(e => e.h !== h));
    return `mesma mensagem ${count}x em ${Math.round(windowMs / 1000)}s`;
  }

  private detectLink(text: string): string | undefined {
    const { suspiciousDomains, flagAllLinks } = this.deps.config.moderation.links;
    const suspicious = suspiciousDomains.map(d => d.toLowerCase());
    for (const match of text.matchAll(URL_LIKE)) {
      const domain = (match[1] ?? '').toLowerCase();
      if (suspicious.some(d => domain === d || domain.endsWith(`.${d}`))) return `domínio ${domain.slice(0, 60)}`;
      if (flagAllLinks && /^(?:https?:\/\/|www\.)/iu.test(match[0])) return `domínio ${domain.slice(0, 60)}`;
    }
    return undefined;
  }
}
