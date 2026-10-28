import { expect, it } from 'vitest';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { FakeWhatsAppAdapter } from '@aerobot/core';
import { ControlClient, HttpTransport, UnsupportedControlOperation, hashPassword } from '@aerobot/control-protocol';
import { HostController, startControlServer } from '../src/control-host.js';

class Adapter extends FakeWhatsAppAdapter {
  connectionState = 'open'; pendingQueueCount = 0; processedPerMinute = 0;
  lastConnectedAt = new Date().toISOString(); responsesPaused = false;
  setPaused(value: boolean) { this.responsesPaused = value; }
}
it('liga SQLite, ranking, pausa e exportação ao HTTP real sem WhatsApp', async () => {
  const storage = new SqliteStorage(':memory:');
  const adapter = new Adapter();
  const control = await startControlServer(storage, adapter, { AEROBOT_CONTROL_PORT: '0', AEROBOT_ADMIN_PASSWORD_HASH: await hashPassword('test-password-control', { N: 1024 }) });
  try {
    await storage.members.register({ id: 'alice', name: '=Fictícia', identities: [], status: 'active', registeredAt: Date.now() });
    await storage.ledger.append({ id: 'xp1', memberId: 'alice', amount: 500, occurredAt: Date.now(), source: 'message', sourceId: 'msg1', actorId: 'demo', reason: 'teste' });
    const client = new ControlClient(new HttpTransport(control!.url));
    await client.login('test-password-control');
    expect(await client.getHostState()).toMatchObject({ status: 'online', responsesPaused: false });
    expect(await client.setResponsesPaused(true)).toMatchObject({ responsesPaused: true });
    expect(adapter.responsesPaused).toBe(true);
    expect(await client.setResponsesPaused(false)).toMatchObject({ responsesPaused: false });
    expect(await client.getRanking('all_time')).toEqual([{ rank: 1, memberId: 'alice', nickname: '=Fictícia', xp: 500, level: 1, messagesSent: 1 }]);
    const receipt = await client.requestExport('clan_members');
    expect(receipt.rowCount).toBe(1);
    expect(receipt.previewCsv).toContain("'=Fictícia");
    expect(await client.requestExport('xp_ranking')).toMatchObject({ rowCount: 1 });
    expect(await client.requestExport('moderation_audit')).toMatchObject({ dataset: 'moderation_audit' });
    for (const work of [() => client.listGroups(), () => client.setMaintenanceMode(true), () => client.requestExport('command_logs')]) await expect(work()).rejects.toMatchObject({ code: 'unsupported' });
    await client.logout();
  } finally { await control?.server.close(); storage.close(); }
});
it('não inicia sem ambas variáveis e não inventa recursos ausentes', async () => {
  const db = new SqliteStorage(':memory:');
  try {
    expect(await startControlServer(db, new Adapter(), {})).toBeUndefined();
    expect(await startControlServer(db, new Adapter(), { AEROBOT_CONTROL_PORT: '8787' })).toBeUndefined();
    await expect(new HostController(db, new Adapter()).listGroups()).rejects.toBeInstanceOf(UnsupportedControlOperation);
    await expect(new HostController(db, new Adapter()).getOverview()).resolves.toMatchObject({ clanName: 'AERO', hostStatus: 'online', totalMembers: 0, messagesToday: 0 });
  } finally { db.close(); }
});
it('aceita a senha simples em AEROBOT_ADMIN_PASSWORD (hash só em memória) e recusa a errada', async () => {
  const storage = new SqliteStorage(':memory:');
  const control = await startControlServer(storage, new Adapter(), { AEROBOT_CONTROL_PORT: '0', AEROBOT_ADMIN_PASSWORD: 'senha-simples-de-teste' });
  try {
    expect(control).toBeDefined();
    await expect(new ControlClient(new HttpTransport(control!.url)).login('outra-senha-qualquer')).rejects.toMatchObject({ code: 'invalid_credentials' });
    const client = new ControlClient(new HttpTransport(control!.url));
    await expect(client.login('senha-simples-de-teste')).resolves.toMatchObject({ sessionId: expect.any(String) });
    await client.logout();
  } finally { await control?.server.close(); storage.close(); }
});
