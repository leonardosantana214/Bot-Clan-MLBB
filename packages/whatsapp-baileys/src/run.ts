// Manual host only. Never imported by the fake-socket tests.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createBot } from '@aerobot/core';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { BaileysAdapter } from './index.js';
import { BaileysSocketFactory } from './baileys-socket.js';
import qrcode from 'qrcode-terminal';

const privateOutput = (value: string) => { if (value) process.stdout.write(`${value}\n`); };
const phone = process.env.AEROBOT_PAIRING_PHONE;
if (!process.stdout.isTTY) throw new Error('Pairing requires a private interactive terminal');
const adapter = new BaileysAdapter(new BaileysSocketFactory(), {
  pairing: phone ? { mode: 'code', phone, onCode: privateOutput } : { mode: 'qr', onQr: value => qrcode.generate(value, { small: true }) },
  log: message => process.stderr.write(`${message}\n`)
});
await mkdir(adapter.sessionDir, { recursive: true, mode: 0o700 });
const groupId = process.env.AEROBOT_TEST_GROUP;
const storage = new SqliteStorage(join(adapter.sessionDir, 'bot.sqlite'), groupId ? [{ platformGroupId: groupId, allowedCommands: ['ping', 'ajuda', 'registrar', 'perfil', 'xp'] }] : []);
const bot = createBot({ adapter, ...storage, clock: { now: Date.now } });
adapter.setPaused(process.env.AEROBOT_PAUSED === '1');
let pending = Promise.resolve();
const off = adapter.onMessage(message => {
  if (message.groupId === groupId) pending = pending.then(() => bot.receive(message)).catch(() => { process.stderr.write('Bot processing failed\n'); });
});
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  off(); await adapter.disconnect(); await pending; storage.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
await adapter.connect();
