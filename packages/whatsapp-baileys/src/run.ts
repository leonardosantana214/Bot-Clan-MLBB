// Manual host only. Never imported by the fake-socket tests.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { composeHost } from './compose.js';
import { ArenaProvider } from '@aerobot/mlbb-provider';
import { createMlbbCommands } from '@aerobot/mlbb-commands';
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
// MLBB hero commands call the unofficial Rone Arena service (cached 5 min); AEROBOT_DISABLE_MLBB=1 turns them off.
const mlbbEnabled = process.env.AEROBOT_DISABLE_MLBB !== '1';
const mlbbCommands = mlbbEnabled ? createMlbbCommands(new ArenaProvider({ cachePath: join(adapter.sessionDir, 'mlbb-cache.json') })) : [];
const host = composeHost({
  adapter, sessionDir: adapter.sessionDir, extraCommands: mlbbCommands,
  ...(groupId ? { groupId } : {}),
  ...(process.env.AEROBOT_ADMIN_GROUP ? { adminGroupId: process.env.AEROBOT_ADMIN_GROUP } : {}),
  ...(process.env.AEROBOT_BACKUP_DIR ? { backupDir: process.env.AEROBOT_BACKUP_DIR } : {}),
  getPassphrase: () => process.env.AEROBOT_BACKUP_PASSPHRASE
});
adapter.setPaused(process.env.AEROBOT_PAUSED === '1');
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  try { await host.close(); } finally { await adapter.disconnect(); }
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
try { await adapter.connect(); } catch (error) { await shutdown(); throw error; }
