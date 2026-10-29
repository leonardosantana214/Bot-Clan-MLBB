import type { Clock, WhatsAppAdapter } from '@aerobot/core';
import type { CommunityConfig } from './config.js';
import type { CommunityStore, NotificationGateway } from './ports.js';
import { defaultIdGenerator, sanitizeText, type IdGenerator } from './text.js';
import type { AdminEvent, AdminEventType } from './types.js';

const TITLES: Record<AdminEventType, string> = {
  membership: 'Entradas/saídas',
  'pending-registration': 'Cadastros pendentes',
  'leave-review': 'Possíveis saídas da comunidade (revisar)',
  moderation: 'Alertas de moderação'
};

interface Buffer { firstAt: number; total: number; lines: string[] }

export interface AdminNotificationDeps {
  store: CommunityStore; adapter: WhatsAppAdapter; clock: Clock; config: CommunityConfig; newId?: IdGenerator;
}

/**
 * Aggregates admin events per type over a window and delivers them to the admin group only.
 * Lifecycle: registered (durable aggregate) -> queued -> accepted by adapter | failed.
 * Event claims deduplicate local replays; remote sends may repeat after an ambiguous failure.
 * Claim and aggregate are committed atomically. Acceptance is not delivery/read evidence.
 */
export class AdminNotificationService implements NotificationGateway {
  private mutations: Promise<void> = Promise.resolve();
  private readonly destination: string;
  private readonly newId: IdGenerator;
  private processing: Promise<void> = Promise.resolve();

  constructor(private readonly deps: AdminNotificationDeps) {
    this.destination = deps.config.adminGroupId;
    this.newId = deps.newId ?? defaultIdGenerator;
    if (deps.config.chatGroupIds.includes(this.destination)) throw new Error('Admin reports must never target a CHAT group');
  }

  private serialize(work: () => Promise<void>): Promise<void> {
    const run = this.mutations.then(work);
    this.mutations = run.catch(() => undefined);
    return run;
  }

  notify(event: AdminEvent): Promise<void> {
    return this.serialize(async () => {
      const now = this.deps.clock.now();
      const existing = (await this.deps.store.listNotifications('registered')).find(n => n.destination === this.destination && n.type === event.type);
      const buffer: Buffer = existing ? JSON.parse(existing.text) as Buffer : { firstAt: now, total: 0, lines: [] };
      buffer.total++;
      if (buffer.lines.length < this.deps.config.notifications.maxLines) buffer.lines.push(sanitizeLine(event.line));
      await this.deps.store.claimAndSaveNotification(event.id, {
        id: existing?.id ?? this.newId(), destination: this.destination, type: event.type,
        text: JSON.stringify(buffer), state: 'registered', attempts: 0,
        createdAt: buffer.firstAt, updatedAt: now, nextAttemptAt: now, lastError: null
      });
    });
  }

  /** Recovers durable aggregation windows after restart, then processes the queue. */
  async tick(force = false): Promise<void> {
    await this.serialize(async () => {
      const now = this.deps.clock.now();
      for (const item of await this.deps.store.listNotifications('registered')) {
        if (item.destination !== this.destination) continue;
        if (!item.text.startsWith('{')) {
          await this.deps.store.updateNotification(item.id, { state: 'queued', updatedAt: now });
          continue;
        }
        const buffer = JSON.parse(item.text) as Buffer;
        if (!force && now - buffer.firstAt < this.deps.config.notifications.windowMs) continue;
        await this.enqueue(item.id, item.type, buffer, now);
      }
    });
    const run = this.processing.then(() => this.processQueue());
    this.processing = run.catch(() => undefined);
    await run;
  }

  /** Only call when an actual delivery acknowledgement is available; never called on send resolution. */
  async confirm(id: string): Promise<void> {
    const sent = (await this.deps.store.listNotifications('accepted')).find(n => n.id === id);
    if (sent) await this.deps.store.updateNotification(id, { state: 'confirmed', updatedAt: this.deps.clock.now() });
  }

  private async enqueue(id: string, type: AdminEventType, buffer: Buffer, now: number): Promise<void> {
    const { windowMs, maxLines } = this.deps.config.notifications;
    const span = windowMs >= 60_000 ? `${Math.round(windowMs / 60_000)} min` : `${Math.round(windowMs / 1000)} s`;
    const extra = buffer.total - buffer.lines.length;
    const body = buffer.lines.slice(0, maxLines).map(line => `- ${line}`);
    if (extra > 0) body.push(`- ... e mais ${extra}`);
    const text = `${TITLES[type]} nos últimos ${span}:\n${body.join('\n')}`;
    await this.deps.store.updateNotification(id, { text, state: 'queued', updatedAt: now });
  }

  private async processQueue(): Promise<void> {
    const { maxAttempts, retryBaseMs } = this.deps.config.notifications;
    for (const item of await this.deps.store.listNotifications('queued')) {
      const now = this.deps.clock.now();
      if (item.nextAttemptAt > now) continue;
      if (this.deps.config.chatGroupIds.includes(item.destination)) {
        await this.deps.store.updateNotification(item.id, { state: 'failed', updatedAt: now, lastError: 'destination is a CHAT group' });
        continue;
      }
      try {
        await this.deps.adapter.sendMessage(item.destination, item.text);
        await this.deps.store.updateNotification(item.id, { state: 'accepted', attempts: item.attempts + 1, updatedAt: now, lastError: null });
      } catch (error) {
        const attempts = item.attempts + 1;
        const lastError = sanitizeText(error instanceof Error ? error.message : 'send failed', 120);
        if (attempts >= maxAttempts) await this.deps.store.updateNotification(item.id, { state: 'failed', attempts, updatedAt: now, lastError });
        else await this.deps.store.updateNotification(item.id, { state: 'queued', attempts, updatedAt: now, nextAttemptAt: now + retryBaseMs * 2 ** (attempts - 1), lastError });
      }
    }
  }
}

function sanitizeLine(line: string): string { return sanitizeText(line, 200); }
