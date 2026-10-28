import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLog } from '@aerobot/core';
import { ControlClient, ControlServer, ControlTransportError, HttpControlServer, HttpTransport, UnsupportedControlOperation, hashPassword, type HostControlPort } from '../src/index.js';

const password = 'http-test-password';
const unavailable = async (): Promise<never> => { throw new UnsupportedControlOperation(); };
const host: HostControlPort = { getOverview: unavailable, getHostState: unavailable, listGroups: unavailable, setGroupModules: unavailable, setResponsesPaused: unavailable, setMaintenanceMode: unavailable, getRanking: unavailable, requestExport: unavailable };
let server: HttpControlServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; });
async function start(origins: string[] = []) {
  server = new HttpControlServer(new ControlServer({ host, adminPasswordHash: await hashPassword(password, { N: 1024 }), audit: new InMemoryAuditLog(), clock: { now: Date.now } }), { port: 0, origins });
  return server.listen();
}
const request = (type: string, payload: unknown = {}) => ({ schemaVersion: 1, requestId: 'http-test-123', expiresAt: Date.now() + 30000, type, payload });
describe('HTTP real em loopback', () => {
  it('login, operação não suportada e logout pelo cliente real', async () => {
    const url = await start();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    const client = new ControlClient(new HttpTransport(url));
    await client.login(password);
    expect(client.isLoggedIn).toBe(true);
    await expect(client.getOverview()).rejects.toMatchObject({ code: 'unsupported' });
    await client.logout();
    expect(client.isLoggedIn).toBe(false);
  });
  it('nega pedido sem token', async () => {
    const transport = new HttpTransport(await start());
    expect(await transport.send(request('getHostState'))).toMatchObject({ ok: false, error: { code: 'unauthenticated' } });
  });
  it('limita corpo, exige JSON e rejeita JSON inválido', async () => {
    const url = `${await start()}/control`;
    const post = (body: string, content = 'application/json') => fetch(url, { method: 'POST', headers: { 'Content-Type': content }, body });
    expect((await post('x'.repeat(65537))).status).toBe(413);
    expect((await post('{')).status).toBe(400);
    expect((await post('{}', 'text/plain')).status).toBe(415);
  });
  it('nega método errado e rota inexistente', async () => {
    const url = await start();
    const response = await fetch(`${url}/control`);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect((await fetch(url)).status).toBe(404);
  });
  it('nega origem não permitida; permite preflight apenas das origens configuradas', async () => {
    const url = `${await start(['http://localhost:8081'])}/control`;
    const blocked = await fetch(url, { method: 'POST', headers: { Origin: 'http://untrusted.test', 'Content-Type': 'application/json' }, body: JSON.stringify(request('login', { password })) });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'POST' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(preflight.headers.get('cache-control')).toBe('no-store');
    expect(preflight.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('timeout do cliente é tipado', async () => {
    server = new HttpControlServer({ handle: () => new Promise(() => {}) }, { port: 0, timeoutMs: 500 });
    const transport = new HttpTransport(await server.listen(), 20);
    await expect(transport.send({})).rejects.toMatchObject({ name: 'ControlTransportError', code: 'timeout' });
    expect(new ControlTransportError('network')).toBeInstanceOf(Error);
  });
});
