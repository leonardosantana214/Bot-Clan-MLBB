import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaileysAdapter, maskLog, normalize, type AdapterSocket, type SocketEvents, type WireMessage } from '../src/index.js';
import type { WhatsAppAdapter, ObservableWhatsAppAdapter } from '@aerobot/core';

class FakeSocket implements AdapterSocket {
  handlers = new Map<keyof SocketEvents, Set<(value: never) => void>>();
  sendMessage = vi.fn(async (group: string, text: string) => { void group; void text; });
  requestPairingCode = vi.fn(async (phone: string) => { void phone; return 'synthetic-code'; });
  close = vi.fn(async () => {});
  on<K extends keyof SocketEvents>(event: K, handler: (value: SocketEvents[K]) => void) {
    const set = this.handlers.get(event) ?? new Set(); this.handlers.set(event, set);
    set.add(handler as (value: never) => void);
    return () => { set.delete(handler as (value: never) => void); };
  }
  emit<K extends keyof SocketEvents>(event: K, value: SocketEvents[K]) {
    for (const handler of this.handlers.get(event) ?? []) handler(value as never);
  }
}
const raw: WireMessage = { key: { id: 'stable', remoteJid: 'test@g.us', participant: '12345678901@s.whatsapp.net' }, message: { conversation: '/ping' } };
const adapters: BaileysAdapter[] = [];
function setup(options: ConstructorParameters<typeof BaileysAdapter>[1] = {}) {
  const sockets: FakeSocket[] = [];
  const create = vi.fn(async () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
  const adapter = new BaileysAdapter({ create }, options); adapters.push(adapter);
  return { adapter, sockets, create };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(async () => { for (const adapter of adapters.splice(0)) await adapter.disconnect(); vi.useRealTimers(); });
describe('fake socket adapter', () => {
  it('keeps the send-only port compatible and exposes optional capabilities', () => {
    const old: WhatsAppAdapter = { sendMessage: async () => {} };
    const extended: ObservableWhatsAppAdapter = setup().adapter;
    expect(old.sendMessage).toBeTypeOf('function'); expect(extended.connect).toBeTypeOf('function');
  });
  it('normalizes stable ids, group and platform JID including LIDs and ephemeral text', () => {
    expect(normalize(raw)).toEqual({ id: 'stable', groupId: 'test@g.us', senderId: '12345678901@s.whatsapp.net', text: '/ping', fromMe: false });
    expect(normalize({ ...raw, key: { ...raw.key, participant: 'synthetic@lid' }, message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'hello' } } } } })?.senderId).toBe('synthetic@lid');
  });
  it('ignores own, status, broadcasts, direct, incomplete and non-text messages', () => {
    for (const message of [
      { ...raw, key: { ...raw.key, fromMe: true } },
      ...['status@broadcast', 'x@broadcast', 'user@s.whatsapp.net'].map(remoteJid => ({ ...raw, key: { ...raw.key, remoteJid } })),
      { key: { remoteJid: 'test@g.us' } }, { ...raw, message: {} }
    ]) expect(normalize(message)).toBeUndefined();
  });
  it('emits notify messages, membership joins/leaves and observable state', async () => {
    const { adapter, sockets } = setup(); const messages = vi.fn(), members = vi.fn(), states = vi.fn();
    adapter.onMessage(messages); const off = adapter.onMembershipChange(members); adapter.onConnectionState(states);
    await adapter.connect(); const socket = sockets[0]!;
    socket.emit('connection', { connection: 'open' });
    socket.emit('messages', { type: 'append', messages: [raw] });
    socket.emit('messages', { type: 'notify', messages: [raw, { ...raw, key: { ...raw.key, fromMe: true } }] });
    for (const action of ['add', 'remove', 'promote']) socket.emit('participants', { id: 'test@g.us', action, participants: ['member@lid'] });
    expect(messages).toHaveBeenCalledTimes(1); expect(members.mock.calls.map(call => call[0].action)).toEqual(['join', 'leave']);
    off(); socket.emit('participants', { id: 'test@g.us', action: 'add', participants: ['other@lid'] }); expect(members).toHaveBeenCalledTimes(2);
    expect(states.mock.calls.flat()).toEqual(['disconnected', 'connecting', 'open']);
  });
  it('backs off exponentially, caps delay and stops at the attempt limit', async () => {
    const { adapter, sockets, create } = setup({ baseBackoffMs: 100, maxBackoffMs: 150, maxReconnectAttempts: 2 });
    await adapter.connect(); sockets[0]!.emit('connection', { connection: 'close', statusCode: 408 });
    await vi.advanceTimersByTimeAsync(99); expect(create).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(create).toHaveBeenCalledTimes(2);
    sockets[1]!.emit('connection', { connection: 'close', statusCode: 408 });
    await vi.advanceTimersByTimeAsync(149); expect(create).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(create).toHaveBeenCalledTimes(3);
    sockets[2]!.emit('connection', { connection: 'close', statusCode: 408 });
    await vi.advanceTimersByTimeAsync(10000); expect(create).toHaveBeenCalledTimes(3); expect(adapter.connectionState).toBe('failed');
  });
  it.each([401, 403, 440, 500, 411])('does not reconnect after terminal status %s', async statusCode => {
    const { adapter, sockets, create } = setup(); await adapter.connect();
    sockets[0]!.emit('connection', { connection: 'close', statusCode });
    await vi.advanceTimersByTimeAsync(100000); expect(create).toHaveBeenCalledTimes(1);
    expect(adapter.connectionState).toBe(statusCode === 401 ? 'logged-out' : statusCode === 403 ? 'forbidden' : 'failed');
  });
  it('serializes replies and enforces interval and rolling rate limit', async () => {
    const { adapter, sockets } = setup({ minIntervalMs: 100, maxPerWindow: 2, windowMs: 1000 });
    await adapter.connect(); const socket = sockets[0]!; socket.emit('connection', { connection: 'open' });
    const replies = [1, 2, 3].map(n => adapter.sendMessage('test@g.us', String(n)));
    await vi.advanceTimersByTimeAsync(99); expect(socket.sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(socket.sendMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(899); expect(socket.sendMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); await Promise.all(replies); expect(socket.sendMessage).toHaveBeenCalledTimes(3);
  });
  it('pause rejects queued and new replies; resume permits replies', async () => {
    const { adapter, sockets } = setup(); await adapter.connect(); sockets[0]!.emit('connection', { connection: 'open' });
    await adapter.sendMessage('test@g.us', 'one');
    const queued = expect(adapter.sendMessage('test@g.us', 'two')).rejects.toThrow('unavailable');
    adapter.setPaused(true); await queued; await expect(adapter.sendMessage('test@g.us', 'three')).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(2000); expect(sockets[0]!.sendMessage).toHaveBeenCalledTimes(1);
    adapter.setPaused(false); await adapter.sendMessage('test@g.us', 'four');
  });
  it('uses private pairing callbacks and logs only safe events with masked numbers', async () => {
    const log = vi.fn(), onCode = vi.fn(), onQr = vi.fn();
    const code = setup({ log, pairing: { mode: 'code', phone: '12345678901', onCode } });
    await code.adapter.connect(); expect(onCode).toHaveBeenCalledWith('synthetic-code');
    const qr = setup({ log, pairing: { mode: 'qr', onQr } }); await qr.adapter.connect();
    qr.sockets[0]!.emit('connection', { qr: 'synthetic-secret' }); expect(onQr).toHaveBeenCalledWith('synthetic-secret');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/12345678901|synthetic-secret|synthetic-code/);
    expect(maskLog('user +55 (11) 99999-1234 and 12345678901:2@s.whatsapp.net')).not.toMatch(/99999|12345678901/);
  });
  it('disconnect clears reconnect timers and removes socket listeners', async () => {
    const { adapter, sockets, create } = setup(); await adapter.connect();
    sockets[0]!.emit('connection', { connection: 'close', statusCode: 408 }); await Promise.resolve(); await adapter.disconnect();
    await vi.advanceTimersByTimeAsync(100000); expect(create).toHaveBeenCalledTimes(1);
    expect([...sockets[0]!.handlers.values()].every(set => set.size === 0)).toBe(true);
  });
  it('retries factory failures without logging raw exceptions', async () => {
    const create = vi.fn(async (): Promise<AdapterSocket> => { throw new Error('secret 12345678901'); });
    const log = vi.fn(); const adapter = new BaileysAdapter({ create }, { log, maxReconnectAttempts: 1 }); adapters.push(adapter);
    await adapter.connect(); await vi.advanceTimersByTimeAsync(1000);
    expect(create).toHaveBeenCalledTimes(2); expect(adapter.connectionState).toBe('failed');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|12345678901/);
  });
  it('closes a socket whose factory completes during shutdown', async () => {
    let finish!: (socket: AdapterSocket) => void;
    const adapter = new BaileysAdapter({ create: () => new Promise(resolve => { finish = resolve; }) }); adapters.push(adapter);
    const connecting = adapter.connect(); const stopping = adapter.disconnect();
    const socket = new FakeSocket(); finish(socket); await Promise.all([connecting, stopping]);
    expect(socket.close).toHaveBeenCalledOnce(); expect(adapter.connectionState).toBe('disconnected');
  });
  it('waits for in-flight sends and rejects unsent replies during shutdown', async () => {
    const { adapter, sockets } = setup(); await adapter.connect(); const socket = sockets[0]!;
    socket.emit('connection', { connection: 'open' });
    let finish!: () => void;
    socket.sendMessage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const sent = adapter.sendMessage('test@g.us', 'one');
    const rejected = expect(adapter.sendMessage('test@g.us', 'two')).rejects.toThrow('unavailable');
    const stopping = adapter.disconnect(); await rejected; finish(); await Promise.all([sent, stopping]);
    expect(socket.sendMessage).toHaveBeenCalledOnce(); expect(adapter.connectionState).toBe('disconnected');
  });
});
