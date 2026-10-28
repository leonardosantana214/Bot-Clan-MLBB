import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { FakeWhatsAppAdapter } from '@aerobot/core';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { hashPassword } from '@aerobot/control-protocol';
import { startControlServer } from './control-host.js';

if (!process.stdout.isTTY) throw new Error('A demonstração exige terminal local interativo para exibir a senha.');
const folder = await mkdtemp(join(tmpdir(), 'aerobot-control-demo-'));
const storage = new SqliteStorage(join(folder, 'demo.sqlite'));
class DemoAdapter extends FakeWhatsAppAdapter {
  readonly connectionState = 'open';
  readonly pendingQueueCount = 0;
  readonly processedPerMinute = 0;
  readonly lastConnectedAt = new Date().toISOString();
  responsesPaused = false;
  setPaused(value: boolean) { this.responsesPaused = value; }
  override async sendMessage(group: string, text: string) { if (this.responsesPaused) throw new Error('Respostas pausadas.'); await super.sendMessage(group, text); }
}
let control: Awaited<ReturnType<typeof startControlServer>>;
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  try { await control?.server.close(); } finally { storage.close(); await rm(folder, { recursive: true, force: true }); }
}
try {
  for (let i = 1; i <= 5; i++) {
    const id = `demo-${i}`;
    await storage.members.register({ id, name: `Membro fictício ${i}`, status: 'active', registeredAt: Date.now(), identities: [] });
    await storage.ledger.append({ id, memberId: id, amount: i * 150, occurredAt: Date.now(), source: 'manual', sourceId: id, actorId: 'demo', reason: 'XP sintético de demonstração' });
  }
  const password = randomBytes(18).toString('base64url');
  control = await startControlServer(storage, new DemoAdapter(), { ...process.env, AEROBOT_CONTROL_PORT: process.env.AEROBOT_CONTROL_PORT ?? '8787', AEROBOT_ADMIN_PASSWORD_HASH: await hashPassword(password) });
  process.stdout.write(`DEMONSTRAÇÃO: dados sintéticos, sem WhatsApp.\nHost: ${control!.url}\nSenha desta execução (somente terminal local): ${password}\n`);
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
} catch (error) { await shutdown(); throw error; }
