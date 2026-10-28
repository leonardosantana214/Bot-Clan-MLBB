import { z } from 'zod';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const ATTRIBUTION = 'Hero/meta data: Rone Arena (https://arena.rone.dev). Mobile Legends: Bang Bang and game assets: Moonton. Unofficial integration.';
export const heroSchema = z.object({ id: z.union([z.string().min(1), z.number().finite()]).transform(String), name: z.string().trim().min(1), meta: z.record(z.unknown()).optional() }).passthrough();
export type Hero = z.infer<typeof heroSchema>;
const heroesSchema = z.union([z.array(heroSchema), z.object({ heroes: z.array(heroSchema) }), z.object({ data: z.array(heroSchema) }), z.object({ data: z.object({ heroes: z.array(heroSchema) }) })]).transform(value => Array.isArray(value) ? value : 'heroes' in value ? value.heroes : Array.isArray(value.data) ? value.data : value.data.heroes);
export interface Metadata { source: string; collectedAt: string; reliability: 'unverified'; stale: boolean }
export interface ProviderResponse<T> { data: T; metadata: Metadata }
export interface MLBBProvider { listHeroes(): Promise<ProviderResponse<Hero[]>>; findHero(query: string): Promise<ProviderResponse<Hero | undefined>> }
export interface HttpClient { get(url: string, options: { signal: AbortSignal }): Promise<{ status: number; body: unknown }> }
export const fetchHttpClient: HttpClient = { get: async (url, { signal }) => { const response = await fetch(url, { signal, redirect: 'error' }); return { status: response.status, body: await response.json() as unknown }; } };
const cacheSchema = z.object({ source: z.string().url(), collectedAt: z.string().datetime({ offset: true }), data: z.array(heroSchema) });
type Cache = z.infer<typeof cacheSchema>;
export interface ArenaOptions { client?: HttpClient; cachePath?: string; ttlMs?: number; minIntervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; heroesPath?: string }
/** Protocol assumptions are synthetic and not verified against the real service. */
export class ArenaProvider implements MLBBProvider {
  private readonly client: HttpClient;
  private readonly cachePath: string;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastRequest: number | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: ArenaOptions = {}) {
    for (const value of [options.ttlMs, options.minIntervalMs, options.timeoutMs]) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('Invalid timing option');
    this.client = options.client ?? fetchHttpClient; this.cachePath = options.cachePath ?? join(homedir(), '.aerobot', 'cache', 'arena-heroes.json'); this.now = options.now ?? Date.now; this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.safeUrl(options.heroesPath ?? '/api/heroes');
  }
  listHeroes(): Promise<ProviderResponse<Hero[]>> {
    const result = this.queue.then(() => this.load()); this.queue = result.catch(() => undefined); return result;
  }
  async findHero(query: string): Promise<ProviderResponse<Hero | undefined>> { const result = await this.listHeroes(); return { ...result, data: result.data.find(hero => hero.id === query || hero.name.toLocaleLowerCase('en') === query.trim().toLocaleLowerCase('en')) }; }
  private safeUrl(path: string): string { const url = new URL(path, 'https://arena.rone.dev'); if (url.origin !== 'https://arena.rone.dev' || url.username || url.password) throw new Error('Alternative endpoint must use the Arena origin'); return url.href; }
  private response(cache: Cache, stale: boolean): ProviderResponse<Hero[]> { return { data: cache.data, metadata: { source: cache.source, collectedAt: cache.collectedAt, reliability: 'unverified', stale } }; }
  private async request(url: string) {
    const wait = this.lastRequest === undefined ? 0 : Math.max(0, (this.options.minIntervalMs ?? 1000) - (this.now() - this.lastRequest));
    if (wait) await this.sleep(wait);
    this.lastRequest = this.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([this.client.get(url, { signal: controller.signal }), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Arena request timeout')); }, this.options.timeoutMs ?? 10000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  private async load(): Promise<ProviderResponse<Hero[]>> {
    let cached: Cache | undefined;
    try { cached = cacheSchema.parse(JSON.parse(await readFile(this.cachePath, 'utf8'))); } catch { /* Missing/corrupt cache is a miss. */ }
    if (cached && this.now() >= Date.parse(cached.collectedAt) && this.now() - Date.parse(cached.collectedAt) < (this.options.ttlMs ?? 3600000)) return this.response(cached, false);
    let url = this.safeUrl(this.options.heroesPath ?? '/api/heroes');
    try {
      let response = await this.request(url);
      if (response.status === 503) {
        if (cached) return this.response(cached, true);
        const alternative = z.object({ alternative_endpoint: z.string() }).safeParse(response.body);
        if (alternative.success) { url = this.safeUrl(alternative.data.alternative_endpoint); response = await this.request(url); }
      }
      if (response.status !== 200) throw new Error(`Arena HTTP ${response.status}`);
      const entry: Cache = { data: heroesSchema.parse(response.body), source: url, collectedAt: new Date(this.now()).toISOString() };
      await mkdir(dirname(this.cachePath), { recursive: true });
      const temp = `${this.cachePath}.${randomUUID()}.tmp`;
      try { await writeFile(temp, JSON.stringify(entry), { flag: 'wx', mode: 0o600 }); await rename(temp, this.cachePath); } finally { await rm(temp, { force: true }); }
      return this.response(entry, false);
    } catch (error) { if (cached) return this.response(cached, true); throw error; }
  }
}
