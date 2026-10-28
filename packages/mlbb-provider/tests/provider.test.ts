import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ArenaProvider,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TTL_MS,
  MLBBProviderError,
  SHORT_ATTRIBUTION,
  STALE_WARNING,
  formatCounters,
  formatHeroInfo,
  formatMeta,
  formatPercentPtBr,
  formatPpPtBr,
  formatProviderError,
  heroCountersEnvelopeSchema,
  heroDetailEnvelopeSchema,
  heroListEnvelopeSchema,
  heroRankEnvelopeSchema,
  sanitizeApiText,
  type HttpClient,
} from '../src/index.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(join(fixturesDir, name), 'utf8');
  return JSON.parse(raw) as unknown;
}

const tempFolders: string[] = [];
async function createCachePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'arena-test-'));
  tempFolders.push(dir);
  return join(dir, 'cache.json');
}

afterEach(async () => {
  await Promise.all(
    tempFolders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))
  );
});

describe('Zod schemas against real Rone Arena fixtures', () => {
  it('parses rone-heroes.json, rone-detail.json, rone-rank.json and rone-counters.json while preserving extra fields', async () => {
    const [heroesRaw, detailRaw, rankRaw, countersRaw] = await Promise.all([
      loadFixture('rone-heroes.json'),
      loadFixture('rone-detail.json'),
      loadFixture('rone-rank.json'),
      loadFixture('rone-counters.json'),
    ]);

    const heroes = heroListEnvelopeSchema.parse(heroesRaw);
    expect(heroes.code).toBe(0);
    expect(heroes.data.total).toBe(133);
    expect(heroes.data.records).toHaveLength(3);
    expect(heroes.data.records[0]?.data.hero.data.name).toBe('Hirara');
    expect(heroes.data.records[0]?.data.hero_id).toBe(133);

    const detail = heroDetailEnvelopeSchema.parse(detailRaw);
    expect(detail.data.records[0]?.data.hero_id).toBe(1);
    expect(detail.data.records[0]?.data.hero.data.name).toBe('Miya');
    // Passthrough retains extra fields from the real API
    expect((detail.data.records[0]?.data as Record<string, unknown>)['_object']).toBe(2667538);

    const rank = heroRankEnvelopeSchema.parse(rankRaw);
    expect(rank.data.records).toHaveLength(3);
    expect(rank.data.records[0]?.data.main_hero.data.name).toBe('Masha');
    expect(rank.data.records[0]?.data.main_hero_win_rate).toBeCloseTo(0.613522, 6);

    const counters = heroCountersEnvelopeSchema.parse(countersRaw);
    expect(counters.data.records[0]?.data.main_heroid).toBe(1);
    expect(counters.data.records[0]?.data.sub_hero).toHaveLength(5);
    expect(counters.data.records[0]?.data.sub_hero[0]?.heroid).toBe(3);
  });

  it('rejects responses with code != 0 or missing essential structure', async () => {
    const heroesRaw = (await loadFixture('rone-heroes.json')) as Record<string, unknown>;
    const nonZeroCode = { ...heroesRaw, code: 1, message: 'System error' };

    expect(() => heroListEnvelopeSchema.parse(nonZeroCode)).toThrow();
    expect(() => heroListEnvelopeSchema.parse({ code: 0, message: 'OK', data: {} })).toThrow();

    const client: HttpClient = {
      get: async () => ({ status: 200, body: nonZeroCode }),
    };
    const provider = new ArenaProvider({
      client,
      cachePath: await createCachePath(),
      minIntervalMs: 0,
    });

    await expect(provider.listHeroes()).rejects.toThrowError(MLBBProviderError);
    await expect(provider.listHeroes()).rejects.toThrow(/code 1/);
  });
});

describe('ArenaProvider endpoints, caching, stale fallback and counter name resolution', () => {
  it('has default TTL of 300s and default timeout >= 20s', () => {
    expect(DEFAULT_TTL_MS).toBe(300_000);
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
  });

  it('fetches listHeroes, getHero and getMeta with lang=pt and encodeURIComponent', async () => {
    const [heroesRaw, detailRaw, rankRaw] = await Promise.all([
      loadFixture('rone-heroes.json'),
      loadFixture('rone-detail.json'),
      loadFixture('rone-rank.json'),
    ]);

    const requestedUrls: string[] = [];
    const client: HttpClient = {
      get: async url => {
        requestedUrls.push(url);
        if (url.includes('/api/heroes/rank')) return { status: 200, body: rankRaw };
        if (url.includes('/api/heroes/')) return { status: 200, body: detailRaw };
        return { status: 200, body: heroesRaw };
      },
    };

    const provider = new ArenaProvider({
      client,
      cachePath: await createCachePath(),
      minIntervalMs: 0,
    });

    const heroes = await provider.listHeroes();
    expect(heroes.data[0]?.name).toBe('Hirara');
    expect(heroes.data[0]?.hero_id).toBe(133);
    expect(heroes.metadata.source).toBe('https://arena.rone.dev/api/heroes?lang=pt');
    expect(heroes.metadata.stale).toBe(false);

    const detail = await provider.getHero("Chang'e");
    expect(detail.data.name).toBe('Miya');
    expect(detail.data.roles).toEqual(['Marksman']);
    expect(detail.data.lanes).toEqual(['Gold Lane']);
    expect(detail.data.specialities).toEqual(['Finisher', 'Damage']);
    expect(requestedUrls[1]).toBe("https://arena.rone.dev/api/heroes/Chang'e?lang=pt");

    const detailWithSpaces = await provider.getHero('Yi Sun-shin');
    expect(detailWithSpaces.data.hero_id).toBe(1);
    expect(requestedUrls[2]).toBe('https://arena.rone.dev/api/heroes/Yi%20Sun-shin?lang=pt');

    const meta = await provider.getMeta({
      days: 7,
      rank: 'mythic',
      sortField: 'win_rate',
      size: 3,
    });
    expect(meta.data).toHaveLength(3);
    expect(meta.data[0]?.name).toBe('Masha');
    expect(meta.data[0]?.winRate).toBeCloseTo(0.613522, 6);
    expect(requestedUrls[3]).toBe(
      'https://arena.rone.dev/api/heroes/rank?days=7&rank=mythic&sort_field=win_rate&size=3&lang=pt'
    );
  });

  it('resolves missing counter hero names in getCounters using cached /api/heroes list', async () => {
    const [heroesRaw, countersRaw] = await Promise.all([
      loadFixture('rone-heroes.json'),
      loadFixture('rone-counters.json'),
    ]);

    const baseHeroes = heroesRaw as {
      code: number;
      message: string;
      data: { records: Array<Record<string, unknown>>; total: number };
      traceID: null;
    };

    const enrichedHeroes = {
      ...baseHeroes,
      data: {
        ...baseHeroes.data,
        records: [
          ...baseHeroes.data.records,
          {
            data: {
              hero: { data: { name: 'Miya', head: 'https://wsrv.nl/?url=miya.png' } },
              hero_id: 1,
            },
          },
          {
            data: {
              hero: { data: { name: 'Saber', head: 'https://wsrv.nl/?url=saber.png' } },
              hero_id: 3,
            },
          },
          {
            data: {
              hero: { data: { name: 'Zhuxin', head: 'https://wsrv.nl/?url=zhuxin.png' } },
              hero_id: 130,
            },
          },
          {
            data: {
              hero: { data: { name: 'Luo Yi', head: 'https://wsrv.nl/?url=luoyi.png' } },
              hero_id: 43,
            },
          },
        ],
      },
    };

    const get = vi.fn(async (url: string) => {
      if (url.includes('/counters')) {
        return { status: 200, body: countersRaw };
      }
      return { status: 200, body: enrichedHeroes };
    });

    const provider = new ArenaProvider({
      client: { get },
      cachePath: await createCachePath(),
      minIntervalMs: 0,
    });

    const counters = await provider.getCounters('Miya', { days: 7, rank: 'glory', size: 5 });
    expect(counters.data.name).toBe('Miya');
    expect(counters.data.main_heroid).toBe(1);
    expect(counters.data.sub_hero[0]?.heroid).toBe(3);
    expect(counters.data.sub_hero[0]?.name).toBe('Saber');
    expect(counters.data.sub_hero[0]?.hero.data.name).toBe('Saber');
    expect(counters.data.sub_hero[1]?.name).toBe('Zhuxin');
    expect(counters.data.sub_hero[2]?.name).toBe('Luo Yi');
    // Hero ID 80 is not in enrichedHeroes, so it falls back to Herói #80
    expect(counters.data.sub_hero[3]?.name).toBe('Herói #80');

    // Calling getCounters(1) again uses cached /api/heroes and cached counters
    await provider.getCounters(1, { days: 7, rank: 'glory', size: 5 });
    expect(get).toHaveBeenCalledTimes(2); // 1 for /api/heroes, 1 for /api/heroes/1/counters
  });

  it('validates enums and inputs BEFORE making any HTTP request', async () => {
    const get = vi.fn();
    const provider = new ArenaProvider({
      client: { get },
      cachePath: await createCachePath(),
      minIntervalMs: 0,
    });

    await expect(
      provider.getMeta({ days: 2 as never })
    ).rejects.toThrowError(MLBBProviderError);
    await expect(
      provider.getMeta({ rank: 'bronze' as never })
    ).rejects.toThrowError(MLBBProviderError);
    await expect(
      provider.getMeta({ sortField: 'kda' as never })
    ).rejects.toThrowError(MLBBProviderError);
    await expect(
      provider.getCounters(1, { days: 10 as never })
    ).rejects.toThrowError(MLBBProviderError);
    await expect(
      provider.getCounters(1, { rank: 'grandmaster' as never })
    ).rejects.toThrowError(MLBBProviderError);
    await expect(provider.getHero('')).rejects.toThrowError(MLBBProviderError);
    await expect(provider.getHero('../admin')).rejects.toThrowError(MLBBProviderError);

    expect(get).not.toHaveBeenCalled();
  });

  it('uses disk cache within 300s TTL and returns stale=true on 503 High traffic after expiry', async () => {
    const heroesRaw = await loadFixture('rone-heroes.json');
    let now = Date.parse('2026-10-28T12:00:00Z');
    const cachePath = await createCachePath();

    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: heroesRaw })
      .mockResolvedValueOnce({ status: 503, body: { message: 'High traffic' } });

    const options = {
      client: { get },
      cachePath,
      now: () => now,
      minIntervalMs: 0,
    };

    const first = await new ArenaProvider(options).listHeroes();
    expect(first.metadata.stale).toBe(false);
    expect(first.metadata.collectedAt).toBe('2026-10-28T12:00:00.000Z');

    // Within 300s default TTL -> hits disk cache without calling get()
    now += 299_000;
    const cachedHit = await new ArenaProvider(options).listHeroes();
    expect(cachedHit.metadata.stale).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);

    // At 300s TTL expiry -> calls get(), receives 503, returns stale cache preserving collectedAt
    now += 1_000;
    const staleHit = await new ArenaProvider(options).listHeroes();
    expect(staleHit.metadata.stale).toBe(true);
    expect(staleHit.metadata.collectedAt).toBe(first.metadata.collectedAt);
    expect(staleHit.data).toHaveLength(3);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('tries a same-origin alternative endpoint once on 503 when no cache exists and rejects foreign origins', async () => {
    const heroesRaw = await loadFixture('rone-heroes.json');
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        status: 503,
        body: { alternative_endpoint: '/api/heroes?lang=pt&fallback=1' },
      })
      .mockResolvedValueOnce({ status: 200, body: heroesRaw });

    const provider = new ArenaProvider({
      client: { get },
      cachePath: await createCachePath(),
      minIntervalMs: 0,
    });
    const response = await provider.listHeroes();
    expect(response.metadata.source).toBe('https://arena.rone.dev/api/heroes?lang=pt&fallback=1');
    expect(get).toHaveBeenCalledTimes(2);

    const unsafeClient: HttpClient = {
      get: async () => ({
        status: 503,
        body: { alternative_endpoint: 'https://evil.example.com/api/heroes' },
      }),
    };
    await expect(
      new ArenaProvider({
        client: unsafeClient,
        cachePath: await createCachePath(),
        minIntervalMs: 0,
      }).listHeroes()
    ).rejects.toThrow();
  });

  it('serializes concurrent requests with rate limit and times out hanging clients', async () => {
    const heroesRaw = await loadFixture('rone-heroes.json');
    let now = 1_000;
    const starts: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const client: HttpClient = {
      get: async () => {
        starts.push(now);
        return { status: 200, body: heroesRaw };
      },
    };
    const provider = new ArenaProvider({
      client,
      cachePath: await createCachePath(),
      ttlMs: 0,
      minIntervalMs: 50,
      now: () => now,
      sleep,
    });
    await Promise.all([provider.listHeroes(), provider.listHeroes(), provider.listHeroes()]);
    expect(starts).toEqual([1000, 1050, 1100]);
    expect(sleep).toHaveBeenCalledTimes(2);

    const hangingClient: HttpClient = { get: () => new Promise(() => {}) };
    await expect(
      new ArenaProvider({
        client: hangingClient,
        cachePath: await createCachePath(),
        timeoutMs: 5,
        minIntervalMs: 0,
      }).listHeroes()
    ).rejects.toThrow('timeout');
  });
});

describe('Pure PT-BR WhatsApp formatting (no network)', () => {
  it('sanitizes control chars, HTML tags, wsrv.nl URLs, @mentions and long strings', () => {
    const dirty =
      'Olá \u0000\u0007\u200B<font color="a6aafb">@everyone</font> e @5511999999999 veja https://wsrv.nl/?url=https%3A%2F%2Fakmweb.youngjoygame.com%2Ftest.png agora!';
    const cleaned = sanitizeApiText(dirty, 200);
    expect(cleaned).toBe('Olá everyone e 5511999999999 veja agora!');
    expect(cleaned).not.toContain('@');
    expect(cleaned).not.toContain('wsrv.nl');
    expect(cleaned).not.toContain('<font');

    const truncated = sanitizeApiText('A'.repeat(100), 20);
    expect(truncated.length).toBeLessThanOrEqual(20);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('formats percentages and percentage points in PT-BR', () => {
    expect(formatPercentPtBr(0.613522)).toBe('61,4%');
    expect(formatPercentPtBr(0.388732)).toBe('38,9%');
    expect(formatPpPtBr(0.028926)).toBe('+2,9 pp');
    expect(formatPpPtBr(-0.036529)).toBe('-3,7 pp');
  });

  it('formats hero info, meta and counters with real fixtures, attribution footer and stale notice', async () => {
    const [detailRaw, rankRaw, countersRaw] = await Promise.all([
      loadFixture('rone-detail.json'),
      loadFixture('rone-rank.json'),
      loadFixture('rone-counters.json'),
    ]);

    const detailRecord = heroDetailEnvelopeSchema.parse(detailRaw).data.records[0];
    expect(detailRecord).toBeDefined();
    if (!detailRecord) throw new Error('Expected detail record');
    const heroText = formatHeroInfo(detailRecord.data, { stale: true });
    expect(heroText).toContain('*Miya* (ID: 1)');
    expect(heroText).toContain('Função: Marksman');
    expect(heroText).toContain('Rota: Gold Lane');
    expect(heroText).toContain('*Moon Blessing*');
    expect(heroText).not.toContain('<font');
    expect(heroText).not.toContain('wsrv.nl');
    expect(heroText).toContain(STALE_WARNING);
    expect(heroText).toContain(SHORT_ATTRIBUTION);

    const rankEntries = heroRankEnvelopeSchema
      .parse(rankRaw)
      .data.records.map(r => r.data);
    const metaText = formatMeta(rankEntries, { topN: 2, rank: 'mythic', days: 7 });
    expect(metaText).toContain('1. *Masha* — WR: 61,4% | Ban: 38,9% | Pick: 0,5%');
    expect(metaText).toContain('2. *Marcel* — WR: 57,7% | Ban: 39,2% | Pick: 0,3%');
    expect(metaText).not.toContain('Argus');
    expect(metaText).not.toContain('wsrv.nl');
    expect(metaText).not.toContain(STALE_WARNING);
    expect(metaText).toContain(SHORT_ATTRIBUTION);

    const countersRecord = heroCountersEnvelopeSchema.parse(countersRaw).data.records[0];
    expect(countersRecord).toBeDefined();
    if (!countersRecord) throw new Error('Expected counters record');
    const rawCounters = countersRecord.data;
    const countersWithNames = {
      ...rawCounters,
      sub_hero: rawCounters.sub_hero.map((s, idx) => ({
        ...s,
        name: idx === 0 ? 'Saber' : `Counter #${s.heroid}`,
      })),
    };
    const countersText = formatCounters(countersWithNames, { topN: 3, stale: true });
    expect(countersText).toContain('*Melhores Counters contra Miya* (WR base: 49,6%)');
    expect(countersText).toContain('1. *Saber* — +2,9 pp (WR: 51,2%)');
    expect(countersText).toContain('2. *Counter #130* — +2,4 pp (WR: 53,3%)');
    expect(countersText).not.toContain('wsrv.nl');
    expect(countersText).toContain(STALE_WARNING);
    expect(countersText).toContain(SHORT_ATTRIBUTION);
  });

  it('formats friendly PT-BR error messages without leaking internals', () => {
    const customErr = new MLBBProviderError(
      'INVALID_INPUT',
      'internal detail',
      '⚠️ Parâmetros inválidos.'
    );
    expect(formatProviderError(customErr)).toBe('⚠️ Parâmetros inválidos.');
    expect(formatProviderError(new Error('Arena request timeout'))).toContain('demorou muito');
    expect(formatProviderError(new Error('HTTP 404 not found'))).toContain('não encontrado');
    expect(formatProviderError(new Error('HTTP 503 High traffic'))).toContain('alto tráfego');
  });
});
