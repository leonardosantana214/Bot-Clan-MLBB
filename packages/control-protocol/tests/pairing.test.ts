import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditLog } from '@aerobot/core';
import { ControlClient, ControlRequestSchema, ControlServer, HttpControlServer, HttpTransport, UnsupportedControlOperation, hashPassword, type HostControlPort, type WhatsAppConnection } from '../src/index.js';

const unavailable = async (): Promise<never> => { throw new UnsupportedControlOperation(); };
let http: HttpControlServer | undefined;
afterEach(async () => { await http?.close(); http = undefined; });
async function setup() {
  const audit = new InMemoryAuditLog();
  let connection: WhatsAppConnection = { state: 'aguardando_qr', qr: 'synthetic-private-secret', expiresAt: Date.now() + 20_000 };
  const host: HostControlPort = {
    getOverview: unavailable, getHostState: unavailable, setResponsesPaused: unavailable, setMaintenanceMode: unavailable, listGroups: unavailable, setGroupModules: unavailable, getRanking: unavailable, requestExport: unavailable,
    getConnection: async () => connection,
    startPairing: vi.fn(async () => ({ started: true })),
    disconnectSession: vi.fn(async () => { connection = { state: 'sessao_encerrada' }; return { disconnected: true }; }),
    listWhatsAppGroups: async () => [{ id: 'one@g.us', name: 'One' }],
    setGroupRoles: async roles => ({ ...roles, restartRequired: true, message: 'reinicie o Host' })
  };
  const server = new ControlServer({ host, audit, clock: { now: Date.now }, adminPasswordHash: await hashPassword('pairing-test-password', { N: 1024 }) });
  return { host, audit, server };
}
const request = (type: string, extra = {}) => ({ schemaVersion: 1, requestId: 'pair-test-request', expiresAt: Date.now() + 30_000, type, payload: {}, ...extra });
describe('authenticated pairing protocol v1', () => {
  it('requires confirm:true, version and valid group IDs', () => {
    for (const confirm of [undefined, false, 'true']) expect(ControlRequestSchema.safeParse(request('disconnectSession', { idempotencyKey: 'disconnect-key', payload: { confirm } })).success).toBe(false);
    expect(ControlRequestSchema.safeParse(request('disconnectSession', { idempotencyKey: 'disconnect-key', payload: { confirm: true } })).success).toBe(true);
    expect(ControlRequestSchema.safeParse(request('setGroupRoles', { idempotencyKey: 'group-key-123', payload: { chatGroupId: 'user@s.whatsapp.net' } })).success).toBe(false);
    expect(ControlRequestSchema.safeParse(request('getConnection', { schemaVersion: 2 })).success).toBe(false);
  });
  it('requires a session for every operation; never returns QR without authentication', async () => {
    const { server } = await setup();
    for (const type of ['getConnection', 'startPairing', 'disconnectSession', 'listWhatsAppGroups', 'setGroupRoles']) {
      const res = await server.handle(request(type, { idempotencyKey: 'pairing-key-123', ...(type === 'disconnectSession' ? { payload: { confirm: true } } : {}) }), { pairingAllowed: true });
      expect(res).toMatchObject({ ok: false, error: { code: 'unauthenticated' } });
      expect(JSON.stringify(res)).not.toContain('synthetic-private-secret');
    }
  });
  it('fails closed without trusted peer context; ignores spoofed origin and forwarded flags', async () => {
    const { server, host } = await setup();
    const client = new ControlClient({ send: raw => server.handle(raw) });
    await client.login('pairing-test-password');
    await expect(client.startPairing()).rejects.toMatchObject({ code: 'insecure_network' });
    await expect(client.getConnection()).rejects.toMatchObject({ code: 'insecure_network' });
    expect(host.startPairing).not.toHaveBeenCalled();
    const spoof = new ControlClient({ send: raw => server.handle({ ...(raw as object), origin: '127.0.0.1', pairingAllowed: true }, { pairingAllowed: false }) });
    await spoof.login('pairing-test-password');
    await expect(spoof.getConnection()).rejects.toMatchObject({ code: 'insecure_network' });
  });
  it('serves QR over authenticated loopback HTTP, audits metadata only, and clears after logout', async () => {
    const { server, audit, host } = await setup();
    http = new HttpControlServer(server, { port: 0 });
    const client = new ControlClient(new HttpTransport(await http.listen()));
    await client.login('pairing-test-password');
    expect(await client.getConnection()).toMatchObject({ state: 'aguardando_qr', qr: 'synthetic-private-secret' });
    await client.startPairing({ idempotencyKey: 'same-pairing-key' });
    await client.startPairing({ idempotencyKey: 'same-pairing-key' });
    expect(host.startPairing).toHaveBeenCalledTimes(1);
    expect(await client.listWhatsAppGroups()).toEqual([{ id: 'one@g.us', name: 'One' }]);
    expect(await client.setGroupRoles({ chatGroupId: 'one@g.us' })).toMatchObject({ restartRequired: true });
    await client.disconnectSession(true);
    expect(await client.getConnection()).toEqual({ state: 'sessao_encerrada' });
    const entries = await audit.list();
    for (const operation of ['getConnection', 'startPairing', 'disconnectSession', 'listWhatsAppGroups', 'setGroupRoles']) expect(entries.some(e => e.action.startsWith(`control.${operation}`))).toBe(true);
    expect(JSON.stringify(entries)).not.toContain('synthetic-private-secret');
    expect(JSON.stringify(server.commandLog)).not.toContain('synthetic-private-secret');
  });
  it('allows an explicitly trusted transport', async () => {
    const { server } = await setup();
    const client = new ControlClient({ send: raw => server.handle(raw, { pairingAllowed: true }) });
    await client.login('pairing-test-password');
    expect(await client.startPairing()).toEqual({ started: true });
    expect(await client.getConnection()).toMatchObject({ state: 'aguardando_qr' });
  });
});
