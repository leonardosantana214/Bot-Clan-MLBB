import type { WhatsAppConnection } from '@aerobot/control-protocol';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectionState, InboundMessage, MembershipChange, ObservableWhatsAppAdapter } from '@aerobot/core';
import type { AdapterSocket, SocketFactory, WireMessage } from './socket.js';
export type { AdapterSocket, SocketFactory, SocketEvents, WireMessage } from './socket.js';

export function maskLog(value: string): string {
  return value.replace(/\+?\d[\d :().-]{5,}\d/g, '[masked]');
}
export function normalize(message: WireMessage): InboundMessage | undefined {
  const { key } = message;
  if (key.fromMe || !key.id || !key.remoteJid?.endsWith('@g.us') || !key.participant) return;
  let body = message.message;
  for (let i = 0; i < 5 && body?.ephemeralMessage; i++) body = body.ephemeralMessage.message;
  const text = body?.conversation ?? body?.extendedTextMessage?.text;
  if (typeof text !== 'string') return;
  return { id: key.id, groupId: key.remoteJid, senderId: key.participant, text, fromMe: false };
}
type Handler<T> = (value: T) => void;
/** Internal adapter capability; the public control snapshot excludes the raw JID. */
export type AdapterPairingState = WhatsAppConnection & { botJid?: string };
export interface AdapterOptions {
  sessionDir?: string;
  pairing?: { mode: 'qr'; onQr: Handler<string> } | { mode: 'code'; phone: string; onCode: Handler<string> };
  minIntervalMs?: number; maxPerWindow?: number; windowMs?: number; maxQueue?: number;
  baseBackoffMs?: number; maxBackoffMs?: number; maxReconnectAttempts?: number;
  log?: Handler<string>;
}
export class BaileysAdapter implements ObservableWhatsAppAdapter {
  readonly sessionDir: string;
  private socket: AdapterSocket | undefined;
  private state: ConnectionState = 'disconnected';
  private paused = false;
  private stopped = true;
  private generation = 0;
  private attempts = 0;
  private opening: Promise<void> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private sendTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanup: (() => void)[] = [];
  private messages = new Set<Handler<InboundMessage>>();
  private receipts = new Set<Handler<{id:string;groupId:string}>>();
  onReceivedMessage(handler: Handler<{id:string;groupId:string}>): () => void { this.receipts.add(handler); return () => {this.receipts.delete(handler);}; }
  private memberships = new Set<Handler<MembershipChange>>();
  private states = new Set<Handler<ConnectionState>>();
  private queue: { group: string; text: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  private sending: Promise<void> | undefined;
  private sent: number[] = [];
  private lastSent = -Infinity;
  constructor(private readonly factory: SocketFactory, private readonly options: AdapterOptions = {}) {
    this.sessionDir = options.sessionDir ?? process.env.AEROBOT_SESSION_DIR ?? join(homedir(), '.aerobot', 'whatsapp-session');
    if (options.pairing?.mode === 'code' && !/^\d{7,15}$/.test(options.pairing.phone)) throw new Error('Pairing phone must contain country code and digits only');
    for (const value of [options.minIntervalMs, options.maxPerWindow, options.windowMs, options.maxQueue, options.baseBackoffMs, options.maxBackoffMs, options.maxReconnectAttempts]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error('Limits must be positive integers');
    }
  }
  private pairingState: AdapterPairingState = { state: 'desconectado' };
  private pairingObservers = new Set<Handler<AdapterPairingState>>();
  private qrTimer: ReturnType<typeof setTimeout> | undefined;
  get connectionSnapshot(): WhatsAppConnection {
    const snapshot = this.pairingSnapshot;
    delete snapshot.botJid;
    return snapshot;
  }
  get pairingSnapshot(): AdapterPairingState {
    if (this.pairingState.state === 'aguardando_qr' && Date.now() >= this.pairingState.expiresAt) this.setPairing({ state: 'conectando' });
    return { ...this.pairingState };
  }
  onPairingState(handler: Handler<AdapterPairingState>): () => void {
    this.pairingObservers.add(handler); handler(this.pairingSnapshot);
    return () => { this.pairingObservers.delete(handler); };
  }
  private setPairing(state: AdapterPairingState): void {
    if (this.qrTimer) clearTimeout(this.qrTimer);
    this.qrTimer = undefined; this.pairingState = state;
    if (state.state === 'aguardando_qr') this.qrTimer = setTimeout(() => { this.setPairing({ state: 'conectando' }); }, Math.max(0, state.expiresAt - Date.now()));
    this.emit(this.pairingObservers, { ...state });
  }
  private pairingActions = Promise.resolve();
  private serializePairing(work: () => Promise<void>): Promise<void> {
    const result = this.pairingActions.then(work);
    this.pairingActions = result.catch(() => undefined);
    return result;
  }
  startPairing(): Promise<void> {
    return this.serializePairing(async () => {
      if (this.state === 'open') return;
      const resetCredentials = this.state === 'logged-out';
      await this.disconnect();
      if (resetCredentials) {
        if (!this.factory.clearSession) throw new Error('Session reset unavailable');
        await this.factory.clearSession(this.sessionDir);
      }
      await this.connect();
    });
  }
  logoutSession(): Promise<void> { return this.serializePairing(() => this.performLogout()); }
  private async performLogout(): Promise<void> {
    if (!this.factory.clearSession) throw new Error('Session reset unavailable');
    // Stop retries and observers before logout emits a close event.
    this.stopped = true; this.setPairing({ state: 'sessao_encerrada' });
    const socket = this.socket;
    let failure: unknown;
    try { await socket?.logout?.(); } catch (error) { failure = error; }
    await this.disconnect();
    await this.factory.clearSession(this.sessionDir);
    this.setState('logged-out');
    if (failure) this.log('Remote logout failed; local credentials removed');
  }
  async listWhatsAppGroups(): Promise<{ id: string; name: string; memberCount?: number }[]> {
    if (this.state !== 'open') return [];
    const socket = this.socket;
    if (!socket?.listGroups) throw new Error('Group listing unavailable');
    const groups = await socket.listGroups();
    return this.state === 'open' && socket === this.socket ? groups : [];
  }
  private connectedAt = 'Nunca conectado';
  get lastConnectedAt(): string { return this.connectedAt; }
  get responsesPaused(): boolean { return this.paused; }
  get pendingQueueCount(): number { return this.queue.length; }
  get processedPerMinute(): number { return this.sent.filter(t => t > Date.now() - 60_000).length; }
  get connectionState(): ConnectionState { return this.state; }
  onMessage(h: Handler<InboundMessage>): () => void { this.messages.add(h); return () => { this.messages.delete(h); }; }
  onMembershipChange(h: Handler<MembershipChange>): () => void { this.memberships.add(h); return () => { this.memberships.delete(h); }; }
  onConnectionState(h: Handler<ConnectionState>): () => void { this.states.add(h); h(this.state); return () => { this.states.delete(h); }; }
  private emit<T>(handlers: Set<Handler<T>>, value: T): void {
    for (const handler of handlers) { try { handler(value); } catch { this.log('Observer failed'); } }
  }
  private log(text: string): void { try { this.options.log?.(maskLog(text)); } catch { /* Logging cannot interrupt lifecycle cleanup. */ } }
  private setState(state: ConnectionState): void { if (state === 'open') this.connectedAt = new Date().toISOString(); this.state = state; this.setPairing({ state: state === 'open' ? 'conectado' : state === 'logged-out' ? 'sessao_encerrada' : state === 'connecting' || state === 'reconnecting' ? 'conectando' : 'desconectado' }); this.log(`WhatsApp ${state}`); this.emit(this.states, state); }
  connect(): Promise<void> {
    if (this.opening) return this.opening;
    if (!this.stopped) return Promise.resolve();
    this.stopped = false; this.attempts = 0;
    return this.open();
  }
  private open(): Promise<void> {
    const generation = ++this.generation;
    this.setState('connecting');
    const work = (async () => {
      try {
        const socket = await this.factory.create(this.sessionDir);
        if (this.stopped || generation !== this.generation) { await socket.close(); return; }
        this.socket = socket;
        this.cleanup = [
          socket.on('connection', update => {
            if (generation !== this.generation || this.stopped) return;
            if (update.qr && update.connection !== 'open') this.setPairing({ state: 'aguardando_qr', qr: update.qr, expiresAt: Date.now() + 20_000 });
            if (update.qr && this.options.pairing?.mode === 'qr') this.options.pairing.onQr(update.qr);
            if (update.connection === 'open') { this.attempts = 0; this.setState('open'); this.setPairing({ state: 'conectado', ...(update.botJid ? { botJid: update.botJid, botNumber: update.botJid.split('@')[0]!.split(':')[0]!.replace(/[^0-9]/g, '').slice(0, 20) } : {}), ...(update.botName ? { botName: update.botName.slice(0, 128) } : {}) }); this.pump(); }
            if (update.connection === 'close') void this.closed(update.statusCode);
          }),
          socket.on('messages', event => {
            if (event.type !== 'notify' || this.stopped) return;
            for (const raw of event.messages) { if(raw.message && !raw.key.fromMe && raw.key.id && raw.key.remoteJid?.endsWith('@g.us')) this.emit(this.receipts,{id:raw.key.id,groupId:raw.key.remoteJid}); const message = normalize(raw); if (message) this.emit(this.messages, message); }
          }),
          socket.on('participants', event => {
            if (!event.id.endsWith('@g.us') || !['add', 'remove'].includes(event.action)) return;
            for (const participantId of event.participants) this.emit(this.memberships, { groupId: event.id, participantId, action: event.action === 'add' ? 'join' : 'leave' });
          })
        ];
        if (this.options.pairing?.mode === 'code') {
          const code = await socket.requestPairingCode(this.options.pairing.phone);
          if (code && !this.stopped && generation === this.generation) this.options.pairing.onCode(code);
        }
      } catch { if (!this.stopped && generation === this.generation) await this.closed(); }
    })();
    this.opening = work;
    void work.finally(() => { if (this.opening === work) this.opening = undefined; });
    return work;
  }
  private async release(): Promise<void> {
    this.generation++;
    for (const off of this.cleanup.splice(0)) off();
    const socket = this.socket; this.socket = undefined;
    try { await socket?.close(); } catch { this.log('Socket close failed'); }
  }
  private async closed(code?: number): Promise<void> {
    this.setState('disconnected');
    this.rejectQueue();
    await this.release();
    if (this.stopped) return;
    if (code === 401 || code === 403 || code === 440 || code === 500 || code === 411) {
      this.stopped = true; this.rejectQueue(); this.setState(code === 401 ? 'logged-out' : code === 403 ? 'forbidden' : 'failed'); return;
    }
    if (this.attempts >= (this.options.maxReconnectAttempts ?? 5)) { this.stopped = true; this.rejectQueue(); this.setState('failed'); return; }
    const delay = Math.min((this.options.baseBackoffMs ?? 1000) * 2 ** this.attempts++, this.options.maxBackoffMs ?? 30000);
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; if (!this.stopped) void this.open(); }, delay);
  }
  setPaused(paused: boolean): void { this.paused = paused; if (paused) this.rejectQueue(); }
  sendMessage(group: string, text: string): Promise<void> {
    if (this.paused || this.stopped || this.state !== 'open') return Promise.reject(new Error('Replies unavailable'));
    if (!group.endsWith('@g.us') || !text.trim() || this.queue.length >= (this.options.maxQueue ?? 50)) return Promise.reject(new Error('Invalid reply or queue full'));
    return new Promise((resolve, reject) => { this.queue.push({ group, text, resolve, reject }); this.pump(); });
  }
  private pump(): void {
    if (this.sending || this.sendTimer || !this.queue.length || this.paused || this.stopped || this.state !== 'open') return;
    const now = Date.now(), window = this.options.windowMs ?? 60000;
    this.sent = this.sent.filter(time => now - time < window);
    const wait = Math.max(0, this.lastSent + (this.options.minIntervalMs ?? 1000) - now,
      this.sent.length >= (this.options.maxPerWindow ?? 20) ? this.sent[0]! + window - now : 0);
    if (wait) { this.sendTimer = setTimeout(() => { this.sendTimer = undefined; this.pump(); }, wait); return; }
    const item = this.queue.shift()!, socket = this.socket!;
    this.lastSent = now; this.sent.push(now);
    this.sending = (async () => {
      try { await socket.sendMessage(item.group, item.text); item.resolve(); }
      catch { item.reject(new Error('Reply failed')); this.log('Reply failed'); }
    })();
    void this.sending.finally(() => { this.sending = undefined; this.pump(); });
  }
  private rejectQueue(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer); this.sendTimer = undefined;
    for (const item of this.queue.splice(0)) item.reject(new Error('Replies unavailable'));
  }
  async disconnect(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
    this.rejectQueue(); await this.release(); await this.opening; await this.sending;
    this.setState('disconnected');
  }
}
