import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { BaileysAdapter, type AdapterSocket, type SocketEvents } from '../src/index.js';
import { HostController, readGroupRoles } from '../src/control-host.js';

class Socket implements AdapterSocket {
  handlers = new Map<keyof SocketEvents, (v: never) => void>();
  on<K extends keyof SocketEvents>(key: K, handler: (v: SocketEvents[K]) => void) { this.handlers.set(key, handler as (v: never) => void); return () => { this.handlers.delete(key); }; }
  emit(value: SocketEvents['connection']) { this.handlers.get('connection')?.(value as never); }
  sendMessage = async () => {};
  requestPairingCode = async () => '';
  close = vi.fn(async () => {});
  logout = vi.fn(async () => {});
  listGroups = vi.fn(async () => [{ id: 'chat@g.us', name: 'Chat' }, { id: 'adm@g.us', name: 'Admin' }]);
}
const adapters: BaileysAdapter[] = [];
const folders: string[] = [];
afterEach(async () => {
  for (const a of adapters.splice(0)) await a.disconnect();
  vi.useRealTimers();
  for (const path of folders.splice(0)) await rm(path, { force: true, recursive: true });
});
function setup() {
  const sockets: Socket[] = [];
  const clearSession = vi.fn(async () => {});
  const log = vi.fn();
  const adapter = new BaileysAdapter({ create: async () => { const s = new Socket(); sockets.push(s); return s; }, clearSession }, { log });
  adapters.push(adapter); return { adapter, sockets, clearSession, log };
}
describe('pairing without network', () => {
  it('publishes rotated QR in memory, expires conservatively and removes QR on connect/close', async () => {
    vi.useFakeTimers();
    const { adapter, sockets, log } = setup();
    const observer = vi.fn(); adapter.onPairingState(observer);
    await adapter.connect();
    sockets[0]!.emit({ qr: 'private-qr-one' });
    expect(adapter.connectionSnapshot).toMatchObject({ state: 'aguardando_qr', qr: 'private-qr-one' });
    await vi.advanceTimersByTimeAsync(5000);
    sockets[0]!.emit({ qr: 'private-qr-two' });
    expect(adapter.connectionSnapshot).toMatchObject({ qr: 'private-qr-two' });
    await vi.advanceTimersByTimeAsync(20_001);
    expect(adapter.connectionSnapshot).toEqual({ state: 'conectando' });
    sockets[0]!.emit({ qr: 'private-qr-three' });
    sockets[0]!.emit({ connection: 'open', botJid: '5511999999999:2@s.whatsapp.net', botName: 'Test bot' });
    expect(adapter.connectionSnapshot).toEqual({ state: 'conectado', botNumber: '5511999999999', botName: 'Test bot' });
    expect(observer).toHaveBeenLastCalledWith(expect.objectContaining({ botJid: '5511999999999:2@s.whatsapp.net' }));
    expect(adapter.connectionSnapshot).not.toHaveProperty('botJid');
    expect(await adapter.listWhatsAppGroups()).toHaveLength(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-qr');
    await adapter.disconnect();
    expect(adapter.connectionSnapshot).toEqual({ state: 'desconectado' });
    expect(await adapter.listWhatsAppGroups()).toEqual([]);
    expect(observer).toHaveBeenCalled();
  });
  it('restarts an unpaired connection, leaves paired sessions connected, and logs out without retry', async () => {
    const { adapter, sockets, clearSession } = setup();
    await adapter.connect(); sockets[0]!.emit({ qr: 'private-qr' });
    await adapter.startPairing(); expect(sockets).toHaveLength(2);
    sockets[0]!.emit({ qr: 'stale-qr' });
    expect(JSON.stringify(adapter.connectionSnapshot)).not.toContain('stale-qr');
    sockets[1]!.emit({ connection: 'open' });
    await adapter.startPairing(); expect(sockets).toHaveLength(2);
    await adapter.logoutSession();
    expect(sockets[1]!.logout).toHaveBeenCalledOnce(); expect(clearSession).toHaveBeenCalledOnce();
    expect(adapter.connectionSnapshot).toEqual({ state: 'sessao_encerrada' });
    expect(await adapter.listWhatsAppGroups()).toEqual([]);
    await adapter.startPairing(); expect(sockets).toHaveLength(3);
  });
  it('persists known distinct roles without touching database; rejects malformed config', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pair-roles-')); folders.push(folder);
    const { adapter, sockets } = setup();
    const storage = new SqliteStorage(join(folder, 'bot.sqlite'));
    const host = new HostController(storage, { sessionDir: folder, get connectionSnapshot() { return adapter.connectionSnapshot; }, connectionState: 'open', pendingQueueCount: 0, processedPerMinute: 0, responsesPaused: false, lastConnectedAt: '', setPaused() {}, listWhatsAppGroups: () => adapter.listWhatsAppGroups() });
    try {
      await adapter.connect(); sockets[0]!.emit({ connection: 'open' });
      expect(await readGroupRoles(folder)).toEqual({});
      await expect(host.setGroupRoles({ chatGroupId: 'unknown@g.us' })).rejects.toThrow();
      await host.setGroupRoles({ chatGroupId: 'chat@g.us' });
      await expect(host.setGroupRoles({ adminGroupId: 'chat@g.us' })).rejects.toThrow();
      expect(await host.setGroupRoles({ adminGroupId: 'adm@g.us' })).toMatchObject({ chatGroupId: 'chat@g.us', adminGroupId: 'adm@g.us', restartRequired: true });
      expect(await readGroupRoles(folder)).toEqual({ chatGroupId: 'chat@g.us', adminGroupId: 'adm@g.us' });
      expect(await readFile(join(folder, 'group-roles.json'), 'utf8')).not.toContain('qr');
      expect((await stat(join(folder, 'bot.sqlite'))).size).toBeGreaterThan(0);
      if (process.platform !== 'win32') expect((await stat(join(folder, 'group-roles.json'))).mode & 0o777).toBe(0o600);
      else {
        const acl = await promisify(execFile)('icacls.exe', [join(folder, 'group-roles.json')], { windowsHide: true });
        expect(acl.stdout).not.toContain('(I)');
        expect(acl.stdout).toContain('(F)');
      }
      await writeFile(join(folder, 'group-roles.json'), '{bad');
      await expect(readGroupRoles(folder)).rejects.toThrow('Configuração');
    } finally { storage.close(); }
  });
  it('clears revoked credentials before requesting a fresh QR', async () => {
    const { adapter, sockets, clearSession } = setup();
    await adapter.connect(); sockets[0]!.emit({ connection: 'close', statusCode: 401 });
    await vi.waitFor(() => expect(adapter.connectionState).toBe('logged-out'));
    await adapter.startPairing();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(2);
    sockets[1]!.emit({ qr: 'fresh-after-revocation' });
    expect(adapter.connectionSnapshot).toMatchObject({ state: 'aguardando_qr', qr: 'fresh-after-revocation' });
  });
});
