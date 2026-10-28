import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArenaProvider, type HttpClient } from '../src/index.js';
// Synthetic fixtures: not verified against the real service. No network client is used.
const fixture = { data: { heroes: [{ id: 1, name: 'Synthetic Hero', meta: { tier: 'test' }, extra: true }] } };
const folders: string[] = [];
async function cachePath() { const dir = await mkdtemp(join(tmpdir(), 'arena-test-')); folders.push(dir); return join(dir, 'heroes.json'); }
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
it('uses disk cache before TTL, refreshes at expiry, preserves metadata and finds heroes', async () => {
  let now = Date.parse('2026-01-01T00:00:00Z'); const path = await cachePath();
  const get = vi.fn().mockResolvedValue({ status: 200, body: fixture });
  const options = { client: { get }, cachePath: path, now: () => now, ttlMs: 100, minIntervalMs: 0 };
  const first = await new ArenaProvider(options).listHeroes();
  expect(first.metadata).toEqual({ source: 'https://arena.rone.dev/api/heroes', collectedAt: '2026-01-01T00:00:00.000Z', reliability: 'unverified', stale: false });
  now += 99; expect((await new ArenaProvider(options).findHero('synthetic hero')).data?.id).toBe('1'); expect(get).toHaveBeenCalledTimes(1);
  now += 1; await new ArenaProvider(options).listHeroes(); expect(get).toHaveBeenCalledTimes(2);
});
it('returns stale on 503 High traffic without changing collectedAt', async () => {
  const get = vi.fn().mockResolvedValueOnce({ status: 200, body: fixture }).mockResolvedValue({ status: 503, body: { message: 'High traffic' } });
  const provider = new ArenaProvider({ client: { get }, cachePath: await cachePath(), ttlMs: 0, minIntervalMs: 0 });
  const first = await provider.listHeroes(); const second = await provider.listHeroes();
  expect(second.metadata.stale).toBe(true); expect(second.metadata.collectedAt).toBe(first.metadata.collectedAt);
});
it('tries a same-origin alternative once on 503 when no cache exists', async () => {
  const get = vi.fn().mockResolvedValueOnce({ status: 503, body: { alternative_endpoint: '/api/alternative' } }).mockResolvedValueOnce({ status: 200, body: fixture });
  const response = await new ArenaProvider({ client: { get }, cachePath: await cachePath(), minIntervalMs: 0 }).listHeroes();
  expect(response.metadata.source).toBe('https://arena.rone.dev/api/alternative'); expect(get).toHaveBeenCalledTimes(2);
});
it('rejects invalid responses and unsafe alternative endpoints', async () => {
  for (const response of [{ status: 200, body: { data: [{ id: 1 }] } }, { status: 503, body: { alternative_endpoint: 'https://example.com' } }]) {
    const client: HttpClient = { get: async () => response };
    await expect(new ArenaProvider({ client, cachePath: await cachePath() }).listHeroes()).rejects.toThrow();
  }
});
it('serializes concurrent requests and applies the rate limit', async () => {
  let now = 1000; const starts: number[] = []; const sleep = vi.fn(async (ms: number) => { now += ms; });
  const client: HttpClient = { get: async () => { starts.push(now); return { status: 200, body: fixture }; } };
  const provider = new ArenaProvider({ client, cachePath: await cachePath(), ttlMs: 0, minIntervalMs: 50, now: () => now, sleep });
  await Promise.all([provider.listHeroes(), provider.listHeroes(), provider.listHeroes()]);
  expect(starts).toEqual([1000, 1050, 1100]); expect(sleep).toHaveBeenCalledTimes(2);
});
it('times out even when an injected client ignores cancellation', async () => {
  const client: HttpClient = { get: () => new Promise(() => {}) };
  await expect(new ArenaProvider({ client, cachePath: await cachePath(), timeoutMs: 5 }).listHeroes()).rejects.toThrow('timeout');
});
