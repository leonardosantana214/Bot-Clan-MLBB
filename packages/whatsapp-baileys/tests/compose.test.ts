import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { FakeWhatsAppAdapter, type IncomingMessage, type MembershipChange, type ConnectionState, type ObservableWhatsAppAdapter } from '@aerobot/core';
import { composeHost } from '../src/compose.js';
import { SqliteCommunityStore } from '@aerobot/community';
import { noArguments } from '@aerobot/core';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function setup(adminGroupId?: string, sessionDir?: string) {
  const dir = sessionDir ?? await mkdtemp(join(tmpdir(), 'aerobot-host-'));
  if (!sessionDir) cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const adapter = new FakeWhatsAppAdapter();
  const logs: string[] = [];
  let time = Date.now();
  const host = composeHost({ adapter, sessionDir: dir, groupId: 'chat', ...(adminGroupId ? { adminGroupId } : {}), clock: { now: () => time }, log: line => { logs.push(line); } });
  cleanups.push(() => host.close());
  let id = 0;
  const send = async (groupId: string, text: string) => {
    time += 2000;
    await host.receive({ id: String(++id), groupId, senderId: 'user', text, fromMe: false });
  };
  return { host, adapter, send, logs, dir };
}

it('isolates every administrative command from CHAT and accepts commands in ADM', async () => {
  const { adapter, send } = await setup('adm');
  for (const name of ['pontuar', 'fecharestrela', 'sortearestrela', 'aprovarsorteio', 'desempatar', 'advertir', 'advertencias', 'backup', 'statusbackup']) await send('chat', `/${name}`);
  expect(adapter.sent).toEqual([]);
  await send('adm', '/fecharestrela');
  expect(adapter.sent.at(-1)).toEqual({ groupId: 'adm', text: 'Mês fechado.' });
  await send('adm', '/advertencias unknown');
  expect(adapter.sent.at(-1)?.groupId).toBe('adm');
  await send('adm', '/backup');
  expect(adapter.sent.at(-1)?.text).toContain('Backup concluído');
});

it('CHAT help contains member commands and no admin commands', async () => {
  const { adapter, send } = await setup('adm');
  await send('chat', '/ajuda');
  const help = adapter.sent.at(-1)!.text;
  for (const name of ['estrela', 'historicoestrela', 'minhasadvertencias']) expect(help).toContain(`/${name}`);
  for (const name of ['pontuar', 'fecharestrela', 'advertir', 'advertencias', 'backup', 'statusbackup']) expect(help).not.toContain(`/${name}`);
});

it('disables administration without ADM even after reopening a configured database', async () => {
  const first = await setup('adm');
  await first.host.close();
  const { adapter, send, logs } = await setup(undefined, first.dir);
  for (const group of ['chat', 'adm']) for (const name of ['pontuar', 'fecharestrela', 'advertir', 'backup', 'statusbackup']) await send(group, `/${name}`);
  expect(adapter.sent).toEqual([]);
  expect(logs.join(' ')).toContain('AEROBOT_ADMIN_GROUP');
  await send('chat', '/minhasadvertencias');
  expect(adapter.sent).toHaveLength(1);
});

class ObservableFake extends FakeWhatsAppAdapter implements ObservableWhatsAppAdapter {
  messages = new Set<(message: IncomingMessage) => void>();
  memberships = new Set<(event: MembershipChange) => void>();
  async connect() {}
  async disconnect() {}
  onMessage(handler: (message: IncomingMessage) => void) { this.messages.add(handler); return () => { this.messages.delete(handler); }; }
  onMembershipChange(handler: (event: MembershipChange) => void) { this.memberships.add(handler); return () => { this.memberships.delete(handler); }; }
  onConnectionState(handler: (state: ConnectionState) => void) { void handler; return () => {}; }
}

it('feeds observable events and moderation, ticks reports only to ADM and unsubscribes on shutdown', async () => {
  vi.useFakeTimers();
  try {
    const dir = await mkdtemp(join(tmpdir(), 'aerobot-events-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const adapter = new ObservableFake();
    let time = Date.now();
    const host = composeHost({ adapter, sessionDir: dir, groupId: 'chat', adminGroupId: 'adm', clock: { now: () => time } });
    cleanups.push(() => host.close());
    for (const handler of adapter.memberships) handler({ groupId: 'chat', participantId: 'new-user', action: 'join' });
    for (const handler of adapter.messages) handler({ id: 'link', groupId: 'chat', senderId: 'new-user', text: 'https://bit.ly/suspicious', fromMe: false });
    await host.idle();
    expect(adapter.sent).toEqual([]);
    time += 600_001;
    await vi.advanceTimersByTimeAsync(15_000);
    await host.idle();
    expect(adapter.sent).toHaveLength(3);
    expect(adapter.sent.every(message => message.groupId === 'adm')).toBe(true);
    expect(adapter.sent.some(message => message.text.includes('moderação'))).toBe(true);
    await host.close();
    expect(adapter.messages.size).toBe(0);
    expect(adapter.memberships.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it('rejects a shared ADM/CHAT destination before opening stores', async () => {
  expect(() => composeHost({ adapter: new FakeWhatsAppAdapter(), sessionDir: 'unused', groupId: 'same', adminGroupId: 'same' })).toThrow('distinct');
});

it('deduplica antes da moderação e permite reentrega após falha de handler', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aerobot-redelivery-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const adapter = new FakeWhatsAppAdapter();
  const host = composeHost({ adapter, sessionDir: dir, groupId: 'chat', adminGroupId: 'adm', extraCommands: [{ name: 'retry', input: noArguments, handle: async () => { if (++calls === 1) throw new Error('synthetic handler failure'); return 'Concluído.'; } }] });
  cleanups.push(() => host.close());
  const message = { id: 'repeat-id', groupId: 'chat', senderId: 'synthetic', text: 'Mensagem sintética de repetição', fromMe: false };
  await Promise.all(Array.from({ length: 12 }, () => host.receive(message)));
  const store = new SqliteCommunityStore(join(dir, 'bot.sqlite'));
  try { expect(await store.listFlags()).toHaveLength(0); } finally { store.close(); }
  const command = { ...message, id: 'retry-id', text: '/retry' };
  await expect(host.receive(command)).rejects.toThrow('synthetic handler failure');
  await host.receive(command); await host.receive(command);
  expect(calls).toBe(2); expect(adapter.sent).toEqual([{ groupId: 'chat', text: 'Concluído.' }]);
});
