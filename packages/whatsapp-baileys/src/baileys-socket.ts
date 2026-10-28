import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import { mkdir } from 'node:fs/promises';
import type { AdapterSocket, SocketEvents, SocketFactory } from './socket.js';

/** No library log payloads cross this boundary (they can contain auth material). */
export class BaileysSocketFactory implements SocketFactory {
  async create(sessionDir: string): Promise<AdapterSocket> {
    await mkdir(sessionDir, { recursive: true, mode: 0o700 });
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const socket = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), markOnlineOnConnect: false, syncFullHistory: false });
    let saves = Promise.resolve();
    let authFailed = false;
    const creds = () => { saves = saves.then(saveCreds).catch(() => { authFailed = true; socket.end(new Error('Session persistence failed')); }); };
    socket.ev.on('creds.update', creds);
    return {
      on<K extends keyof SocketEvents>(event: K, handler: (value: SocketEvents[K]) => void): () => void {
        // Each branch is typed at the Baileys boundary; internal events use no library types.
        const emit = <E extends keyof SocketEvents>(value: SocketEvents[E]) => handler(value as SocketEvents[K]);
        if (event === 'connection') {
          const listener = (update: Partial<import('@whiskeysockets/baileys').ConnectionState>) => {
            const error = update.lastDisconnect?.error;
            const statusCode = authFailed ? 500 : (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
            emit<'connection'>({ ...(update.connection ? { connection: update.connection } : {}), ...(update.qr ? { qr: update.qr } : {}), ...(statusCode ? { statusCode } : {}) });
          };
          socket.ev.on('connection.update', listener); return () => { socket.ev.off('connection.update', listener); };
        }
        if (event === 'messages') {
          const listener = (update: import('@whiskeysockets/baileys').BaileysEventMap['messages.upsert']) => emit<'messages'>(update);
          socket.ev.on('messages.upsert', listener); return () => { socket.ev.off('messages.upsert', listener); };
        }
        const listener = (update: import('@whiskeysockets/baileys').BaileysEventMap['group-participants.update']) => emit<'participants'>({ ...update, participants: update.participants.map(p => p.id) });
        socket.ev.on('group-participants.update', listener); return () => { socket.ev.off('group-participants.update', listener); };
      },
      async sendMessage(group, text) { await socket.sendMessage(group, { text }); },
      async requestPairingCode(phone) {
        if (state.creds.registered) return '';
        await socket.waitForConnectionUpdate(async update => Boolean(update.qr), 60000);
        return socket.requestPairingCode(phone);
      },
      async close() { socket.ev.off('creds.update', creds); socket.end(undefined); await saves; }
    };
  }
}
