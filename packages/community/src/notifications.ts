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
 * Lifecycle per message: registered -> queued -> sent -> confirmed | failed (limited retries).
 * Events are claimed by (eventId, destination) so replays never produce duplicates.
 * The in-memory aggregation buffer is lost on crash (the source ledgers keep the facts).
 */
export class AdminNotificationService implements NotificationGateway {
  private readonly buffers = new Map<AdminEventType, Buffer>();
  private readonly destination: string;
  private readonly newId: IdGenerator;
  private processing: Promise<void> = Promise.resolve();

  constructor(private readonly deps: AdminNotificationDeps) {
    this.destination = deps.config.adminGroupId;
    this.newId = deps.newId ?? defaultIdGenerator;
    if (deps.config.chatGroupIds.includes(this.destination)) throw new Error('Admin reports must never target a CHAT group');
  }

  async notify(event: AdminEvent): Promise<void> {
    if (!await this.deps.store.claimNotificationEvent(event.id, this.destination)) return;
    const buffer = this.buffers.get(event.type) ?? { firstAt: this.deps.clock.now(), total: 0, lines: [] };
    buffer.total++;
    if (buffer.lines.length < this.deps.config.notifications.maxLines) buffer.lines.push(sanitizeLine(event.line));
    this.buffers.set(event.type, buffer);
  }

  /** Flushes windows that are due (or all, when force) and then delivers the queue. */
  async tick(force = false): Promise<void> {
    const now = this.deps.clock.now();
    for (const [type, buffer] of [...this.buffers]) {
      if (!force && now - buffer.firstAt < this.deps.config.notifications.windowMs) continue;
      this.buffers.delete(type);
      await this.enqueue(type, buffer, now);
    }
    const run = this.processing.then(() => this.processQueue());
    this.processing = run.catch(() => undefined);
    await run;
  }

  /** Marks a sent notification as confirmed (when autoConfirm is off and a delivery ack arrives). */
  async confirm(id: string): Promise<void> {
    const sent = (await this.deps.store.listNotifications('sent')).find(n => n.id === id);
    if (sent) await this.deps.store.updateNotification(id, { state: 'confirmed', updatedAt: this.deps.clock.now() });
  }

  private async enqueue(type: AdminEventType, buffer: Buffer, now: number): Promise<void> {
    const { windowMs, maxLines } = this.deps.config.notifications;
    const span = windowMs >= 60_000 ? `${Math.round(windowMs / 60_000)} min` : `${Math.round(windowMs / 1000)} s`;
    const extra = buffer.total - buffer.lines.length;
    const body = buffer.lines.slice(0, maxLines).map(line => `- ${line}`);
    if (extra > 0) body.push(`- ... e mais ${extra}`);
    const text = `${TITLES[type]} nos últimos ${span}:\n${body.join('\n')}`;
    const id = this.newId();
    await this.deps.store.saveNotification({ id, destination: this.destination, type, text, state: 'registered', attempts: 0, createdAt: now, updatedAt: now, nextAttemptAt: now, lastError: null });
    await this.deps.store.updateNotification(id, { state: 'queued', updatedAt: now });
  }

  private async processQueue(): Promise<void> {
    const { maxAttempts, retryBaseMs, autoConfirm } = this.deps.config.notifications;
    for (const item of await this.deps.store.listNotifications('queued')) {
      const now = this.deps.clock.now();
      if (item.nextAttemptAt > now) continue;
      if (this.deps.config.chatGroupIds.includes(item.destination)) {
        await this.deps.store.updateNotification(item.id, { state: 'failed', updatedAt: now, lastError: 'destination is a CHAT group' });
        continue;
      }
      try {
        await this.deps.adapter.sendMessage(item.destination, item.text);
        await this.deps.store.updateNotification(item.id, { state: 'sent', attempts: item.attempts + 1, updatedAt: now, lastError: null });
        if (autoConfirm) await this.deps.store.updateNotification(item.id, { state: 'confirmed', updatedAt: now });
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
