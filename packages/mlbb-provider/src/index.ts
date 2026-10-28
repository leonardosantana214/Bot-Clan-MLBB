import { z } from 'zod';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ATTRIBUTION,
  SHORT_ATTRIBUTION,
  STALE_WARNING,
  MLBBProviderError,
  sanitizeApiText,
  cleanApiText,
  formatPercentPtBr,
  formatPpPtBr,
  formatHeroInfo,
  formatMeta,
  formatCounters,
  formatProviderError,
  formatError,
  type ProviderErrorCode,
  type FormatMetadata,
  type FormattedEnvelope,
  type FormattableSkill,
  type FormattableHeroDetail,
  type FormattableMetaEntry,
  type FormattableCounterItem,
  type FormattableCounters,
  type FormatHeroInfoOptions,
  type FormatMetaOptions,
  type FormatCountersOptions,
} from './format.js';

export {
  ATTRIBUTION,
  SHORT_ATTRIBUTION,
  STALE_WARNING,
  MLBBProviderError,
  sanitizeApiText,
  cleanApiText,
  formatPercentPtBr,
  formatPpPtBr,
  formatHeroInfo,
  formatMeta,
  formatCounters,
  formatProviderError,
  formatError,
  type ProviderErrorCode,
  type FormatMetadata,
  type FormattedEnvelope,
  type FormattableSkill,
  type FormattableHeroDetail,
  type FormattableMetaEntry,
  type FormattableCounterItem,
  type FormattableCounters,
  type FormatHeroInfoOptions,
  type FormatMetaOptions,
  type FormatCountersOptions,
};

export const DEFAULT_TTL_MS = 300_000;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MIN_INTERVAL_MS = 1_000;
export const DEFAULT_LANG = 'pt';

export const daysSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(7),
  z.literal(15),
  z.literal(30),
]);
export type MetaDays = z.infer<typeof daysSchema>;

export const rankSchema = z.enum(['all', 'epic', 'legend', 'mythic', 'honor', 'glory']);
export type MetaRank = z.infer<typeof rankSchema>;

export const sortFieldSchema = z.enum(['pick_rate', 'ban_rate', 'win_rate']);
export type MetaSortField = z.infer<typeof sortFieldSchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const langSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid lang parameter');

export const heroQueryInputSchema = z.union([
  z.number().int().positive(),
  z
    .string()
    .trim()
    .min(1, 'Hero ID or name cannot be empty')
    .max(64, 'Hero query too long')
    .refine(val => !/[/\\]|\.\.|[\u0000-\u001F\u007F]/.test(val), 'Invalid characters in hero query'),
]);

export const listHeroesOptionsSchema = z
  .object({
    size: z.number().int().min(1).max(200).optional(),
    index: z.number().int().min(1).optional(),
    order: sortOrderSchema.optional(),
    lang: langSchema.optional(),
  })
  .strict();

export type ListHeroesOptions = {
  size?: number | undefined;
  index?: number | undefined;
  order?: SortOrder | undefined;
  lang?: string | undefined;
};

export const getHeroOptionsSchema = z
  .object({
    lang: langSchema.optional(),
  })
  .strict();

export type GetHeroOptions = {
  lang?: string | undefined;
};

export const getMetaOptionsSchema = z
  .object({
    days: daysSchema.optional(),
    rank: rankSchema.optional(),
    sortField: sortFieldSchema.optional(),
    sort_field: sortFieldSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    sort_order: sortOrderSchema.optional(),
    size: z.number().int().min(1).max(200).optional(),
    index: z.number().int().min(1).optional(),
    lang: langSchema.optional(),
  })
  .strict();

export type GetMetaOptions = {
  days?: MetaDays | undefined;
  rank?: MetaRank | undefined;
  sortField?: MetaSortField | undefined;
  sort_field?: MetaSortField | undefined;
  sortOrder?: SortOrder | undefined;
  sort_order?: SortOrder | undefined;
  size?: number | undefined;
  index?: number | undefined;
  lang?: string | undefined;
};

export const getCountersOptionsSchema = z
  .object({
    days: daysSchema.optional(),
    rank: rankSchema.optional(),
    size: z.number().int().min(1).max(200).optional(),
    index: z.number().int().min(1).optional(),
    lang: langSchema.optional(),
  })
  .strict();

export type GetCountersOptions = {
  days?: MetaDays | undefined;
  rank?: MetaRank | undefined;
  size?: number | undefined;
  index?: number | undefined;
  lang?: string | undefined;
};

const relationTargetSchema = z
  .object({
    target_hero_id: z.array(z.number().int().nonnegative()),
    desc: z.string().optional(),
    target_hero: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const heroRelationSchema = z
  .object({
    assist: relationTargetSchema.optional(),
    strong: relationTargetSchema.optional(),
    weak: relationTargetSchema.optional(),
  })
  .passthrough();

export const heroListRecordDataSchema = z
  .object({
    hero_id: z.number().int().positive(),
    hero: z
      .object({
        data: z
          .object({
            name: z.string().trim().min(1),
            head: z.string().optional(),
            smallmap: z.string().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    relation: heroRelationSchema.optional(),
  })
  .passthrough();

export const heroSkillTagSchema = z
  .object({
    tagid: z.number().int().optional(),
    tagname: z.string().optional(),
    tagrgb: z.string().optional(),
  })
  .passthrough();

export const heroSkillSchema = z
  .object({
    skillid: z.number().int().optional(),
    skillname: z.string(),
    'skillcd&cost': z.string().optional(),
    skilldesc: z.string().optional(),
    skillicon: z.string().optional(),
    skillvideo: z.string().optional(),
    skilltag: z.array(heroSkillTagSchema).optional(),
  })
  .passthrough();

export const heroSkillGroupSchema = z
  .object({
    skilllistid: z.string().optional(),
    skilllist: z.array(heroSkillSchema).optional(),
  })
  .passthrough();

export const heroDetailRecordDataSchema = z
  .object({
    hero_id: z.number().int().positive(),
    head: z.string().optional(),
    head_big: z.string().optional(),
    url: z.string().optional(),
    relation: heroRelationSchema.optional(),
    hero: z
      .object({
        data: z
          .object({
            name: z.string().trim().min(1),
            heroid: z.number().int().positive().optional(),
            head: z.string().optional(),
            smallmap: z.string().optional(),
            painting: z.string().optional(),
            difficulty: z.string().optional(),
            story: z.string().optional(),
            tale: z.string().optional(),
            abilityshow: z.array(z.string()).optional(),
            sortlabel: z.array(z.string()).optional(),
            roadsortlabel: z.array(z.string()).optional(),
            speciality: z.array(z.string()).optional(),
            heroskilllist: z.array(heroSkillGroupSchema).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const rateFractionSchema = z.number().finite().min(0).max(1);

export const rankSubHeroSchema = z
  .object({
    heroid: z.number().int().positive(),
    increase_win_rate: z.number().finite(),
    hero: z
      .object({
        data: z
          .object({
            name: z.string().optional(),
            head: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const heroRankRecordDataSchema = z
  .object({
    main_heroid: z.number().int().positive(),
    main_hero: z
      .object({
        data: z
          .object({
            name: z.string().trim().min(1),
            head: z.string().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    main_hero_win_rate: rateFractionSchema,
    main_hero_ban_rate: rateFractionSchema,
    main_hero_appearance_rate: rateFractionSchema,
    sub_hero: z.array(rankSubHeroSchema).optional().default([]),
  })
  .passthrough();

export const counterSubHeroSchema = z
  .object({
    heroid: z.number().int().positive(),
    increase_win_rate: z.number().finite(),
    hero_win_rate: rateFractionSchema.optional(),
    hero_appearance_rate: rateFractionSchema.optional(),
    hero_index: z.number().int().optional(),
    hero: z
      .object({
        data: z
          .object({
            name: z.string().optional(),
            head: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const heroCountersRecordDataSchema = z
  .object({
    main_heroid: z.number().int().positive(),
    main_hero: z
      .object({
        data: z
          .object({
            name: z.string().trim().min(1),
            head: z.string().optional(),
          })
          .passthrough(),
      })
      .passthrough()
      .optional(),
    main_hero_win_rate: rateFractionSchema,
    main_hero_ban_rate: rateFractionSchema,
    main_hero_appearance_rate: rateFractionSchema,
    sub_hero: z.array(counterSubHeroSchema),
    sub_hero_last: z.array(counterSubHeroSchema).optional(),
  })
  .passthrough();

export function createEnvelopeSchema<T extends z.ZodTypeAny>(
  recordDataSchema: T,
  minRecords = 0
) {
  return z
    .object({
      code: z.literal(0),
      message: z.string(),
      data: z
        .object({
          records: z
            .array(
              z
                .object({
                  data: recordDataSchema,
                })
                .passthrough()
            )
            .min(minRecords),
          total: z.number().int().nonnegative(),
        })
        .passthrough(),
      traceID: z.string().nullable().optional(),
    })
    .passthrough();
}

export const heroListEnvelopeSchema = createEnvelopeSchema(heroListRecordDataSchema, 0);
/** Parsed envelope shape; annotated explicitly because the inferred zod type is too large for TS to serialize (TS7056). */
export type EnvelopeOutput<T> = {
  code: 0;
  message: string;
  data: { records: Array<{ data: T } & Record<string, unknown>>; total: number } & Record<string, unknown>;
  traceID?: string | null | undefined;
} & Record<string, unknown>;

export const heroDetailEnvelopeSchema: z.ZodType<
  EnvelopeOutput<z.output<typeof heroDetailRecordDataSchema>>,
  z.ZodTypeDef,
  unknown
> = createEnvelopeSchema(heroDetailRecordDataSchema, 1);
export const heroRankEnvelopeSchema = createEnvelopeSchema(heroRankRecordDataSchema, 0);
export const heroCountersEnvelopeSchema = createEnvelopeSchema(heroCountersRecordDataSchema, 1);

export type RawHeroListRecord = z.infer<typeof heroListRecordDataSchema>;
export type RawHeroDetailRecord = z.infer<typeof heroDetailRecordDataSchema>;
export type RawHeroRankRecord = z.infer<typeof heroRankRecordDataSchema>;
export type RawHeroCountersRecord = z.infer<typeof heroCountersRecordDataSchema>;

export interface HeroSummary extends RawHeroListRecord {
  id: string;
  name: string;
}
export type Hero = HeroSummary;

export interface HeroDetail extends RawHeroDetailRecord {
  id: string;
  name: string;
  roles: string[];
  lanes: string[];
  specialities: string[];
  difficulty?: string | undefined;
  story?: string | undefined;
}

export interface MetaEntry extends RawHeroRankRecord {
  id: string;
  heroId: number;
  name: string;
  winRate: number;
  banRate: number;
  pickRate: number;
}

export interface ResolvedCounterSubHero extends z.infer<typeof counterSubHeroSchema> {
  name: string;
  hero: {
    data: {
      name: string;
      head?: string | undefined;
    };
  };
}

export interface HeroCounters extends Omit<RawHeroCountersRecord, 'sub_hero' | 'sub_hero_last'> {
  id: string;
  heroId: number;
  name: string;
  sub_hero: ResolvedCounterSubHero[];
  counters: ResolvedCounterSubHero[];
  sub_hero_last?: ResolvedCounterSubHero[] | undefined;
}

export interface Metadata {
  source: string;
  collectedAt: string;
  stale: boolean;
}

export interface ProviderResponse<T> {
  data: T;
  metadata: Metadata;
}

export interface MLBBProvider {
  listHeroes(options?: ListHeroesOptions): Promise<ProviderResponse<HeroSummary[]>>;
  getHero(idOrName: string | number, options?: GetHeroOptions): Promise<ProviderResponse<HeroDetail>>;
  getMeta(options?: GetMetaOptions): Promise<ProviderResponse<MetaEntry[]>>;
  getCounters(
    idOrName: string | number,
    options?: GetCountersOptions
  ): Promise<ProviderResponse<HeroCounters>>;
  findHero(query: string): Promise<ProviderResponse<HeroSummary | undefined>>;
}

export interface HttpClient {
  get(url: string, options: { signal: AbortSignal }): Promise<{ status: number; body: unknown }>;
}

export const fetchHttpClient: HttpClient = {
  get: async (url, { signal }) => {
    const response = await fetch(url, { signal, redirect: 'error' });
    return { status: response.status, body: (await response.json()) as unknown };
  },
};

const cachedItemSchema = z.object({
  source: z.string().url(),
  collectedAt: z.string().datetime({ offset: true }),
  body: z.unknown(),
});

const diskCacheSchema = z.object({
  entries: z.record(cachedItemSchema),
});

type CachedItem = z.infer<typeof cachedItemSchema>;
type DiskCache = z.infer<typeof diskCacheSchema>;

export interface ArenaOptions {
  client?: HttpClient | undefined;
  cachePath?: string | undefined;
  ttlMs?: number | undefined;
  minIntervalMs?: number | undefined;
  timeoutMs?: number | undefined;
  now?: (() => number) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  heroesPath?: string | undefined;
  lang?: string | undefined;
}

/**
 * Validated on 2026-10-28 against https://arena.rone.dev.
 * Upstream format may change without notice.
 */
export class ArenaProvider implements MLBBProvider {
  private readonly client: HttpClient;
  private readonly cachePath: string;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly defaultLang: string;
  private lastRequest: number | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private memoryCache = new Map<string, CachedItem>();

  constructor(private readonly options: ArenaOptions = {}) {
    for (const value of [options.ttlMs, options.minIntervalMs, options.timeoutMs]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new MLBBProviderError(
          'INVALID_INPUT',
          'Invalid timing option',
          '⚠️ Configuração interna de tempo inválida.'
        );
      }
    }
    if (options.lang !== undefined) {
      langSchema.parse(options.lang);
    }
    this.client = options.client ?? fetchHttpClient;
    this.cachePath =
      options.cachePath ?? join(homedir(), '.aerobot', 'cache', 'arena-heroes.json');
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.defaultLang = options.lang ?? DEFAULT_LANG;
    this.safeUrl(options.heroesPath ?? '/api/heroes');
  }

  async listHeroes(options: ListHeroesOptions = {}): Promise<ProviderResponse<HeroSummary[]>> {
    const parsedOptions = this.validateInput(listHeroesOptionsSchema, options);
    const lang = parsedOptions.lang ?? this.defaultLang;
    const basePath = this.options.heroesPath ?? '/api/heroes';
    const url = this.buildUrl(basePath, {
      size: parsedOptions.size,
      index: parsedOptions.index,
      order: parsedOptions.order,
      lang,
    });

    const result = await this.enqueue(() =>
      this.fetchWithCache(url, heroListEnvelopeSchema, envelope =>
        envelope.data.records.map(record => ({
          ...record.data,
          id: String(record.data.hero_id),
          hero_id: record.data.hero_id,
          name: record.data.hero.data.name.trim(),
        }))
      )
    );
    return result;
  }

  async getHero(
    idOrName: string | number,
    options: GetHeroOptions = {}
  ): Promise<ProviderResponse<HeroDetail>> {
    const validQuery = this.validateInput(heroQueryInputSchema, idOrName);
    const parsedOptions = this.validateInput(getHeroOptionsSchema, options);
    const lang = parsedOptions.lang ?? this.defaultLang;
    const encodedHero = encodeURIComponent(String(validQuery).trim());
    const url = this.buildUrl(`/api/heroes/${encodedHero}`, { lang });

    return this.enqueue(() =>
      this.fetchWithCache(url, heroDetailEnvelopeSchema, envelope => {
        const first = envelope.data.records[0];
        if (!first) {
          throw new MLBBProviderError(
            'NOT_FOUND',
            `Hero not found: ${String(validQuery)}`,
            '🔍 Herói não encontrado. Verifique o nome ou ID informado.'
          );
        }
        const raw = first.data;
        const heroData = raw.hero.data;
        return {
          ...raw,
          id: String(raw.hero_id),
          hero_id: raw.hero_id,
          name: heroData.name.trim(),
          roles: (heroData.sortlabel ?? []).map(s => s.trim()).filter(Boolean),
          lanes: (heroData.roadsortlabel ?? []).map(s => s.trim()).filter(Boolean),
          specialities: (heroData.speciality ?? []).map(s => s.trim()).filter(Boolean),
          difficulty: heroData.difficulty,
          story: heroData.story,
        };
      })
    );
  }

  async getMeta(options: GetMetaOptions = {}): Promise<ProviderResponse<MetaEntry[]>> {
    const parsedOptions = this.validateInput(getMetaOptionsSchema, options);
    const lang = parsedOptions.lang ?? this.defaultLang;
    const sortField = parsedOptions.sortField ?? parsedOptions.sort_field;
    const sortOrder = parsedOptions.sortOrder ?? parsedOptions.sort_order;
    const url = this.buildUrl('/api/heroes/rank', {
      days: parsedOptions.days,
      rank: parsedOptions.rank,
      sort_field: sortField,
      sort_order: sortOrder,
      size: parsedOptions.size,
      index: parsedOptions.index,
      lang,
    });

    return this.enqueue(() =>
      this.fetchWithCache(url, heroRankEnvelopeSchema, envelope =>
        envelope.data.records.map(record => {
          const raw = record.data;
          return {
            ...raw,
            id: String(raw.main_heroid),
            heroId: raw.main_heroid,
            name: raw.main_hero.data.name.trim(),
            winRate: raw.main_hero_win_rate,
            banRate: raw.main_hero_ban_rate,
            pickRate: raw.main_hero_appearance_rate,
          };
        })
      )
    );
  }

  async getCounters(
    idOrName: string | number,
    options: GetCountersOptions = {}
  ): Promise<ProviderResponse<HeroCounters>> {
    const validQuery = this.validateInput(heroQueryInputSchema, idOrName);
    const parsedOptions = this.validateInput(getCountersOptionsSchema, options);
    const lang = parsedOptions.lang ?? this.defaultLang;

    const queryStr = String(validQuery).trim();
    const isNumericId = typeof validQuery === 'number' || /^\d+$/.test(queryStr);

    let heroMap = new Map<number, string>();
    let targetId = queryStr;

    if (!isNumericId) {
      const heroesResp = await this.tryLoadHeroMap(lang);
      heroMap = heroesResp;
      const normalized = queryStr.toLocaleLowerCase('pt-BR');
      for (const [id, name] of heroMap.entries()) {
        if (name.toLocaleLowerCase('pt-BR') === normalized) {
          targetId = String(id);
          break;
        }
      }
    }

    const encodedTarget = encodeURIComponent(targetId);
    const url = this.buildUrl(`/api/heroes/${encodedTarget}/counters`, {
      days: parsedOptions.days,
      rank: parsedOptions.rank,
      size: parsedOptions.size,
      index: parsedOptions.index,
      lang,
    });

    const rawResponse = await this.enqueue(() =>
      this.fetchWithCache(url, heroCountersEnvelopeSchema, envelope => {
        const first = envelope.data.records[0];
        if (!first) {
          throw new MLBBProviderError(
            'NOT_FOUND',
            `Counters not found for hero: ${queryStr}`,
            '🔍 Dados de counters não encontrados para este herói.'
          );
        }
        return first.data;
      })
    );

    const rawData = rawResponse.data;
    const needsHeroResolution =
      !rawData.main_hero?.data.name ||
      rawData.sub_hero.some(sub => !sub.hero?.data?.name?.trim()) ||
      (rawData.sub_hero_last?.some(sub => !sub.hero?.data?.name?.trim()) ?? false);

    if (needsHeroResolution && heroMap.size === 0) {
      heroMap = await this.tryLoadHeroMap(lang);
    }

    const resolveSubHero = (
      sub: z.infer<typeof counterSubHeroSchema>
    ): ResolvedCounterSubHero => {
      const existingName = sub.hero?.data?.name?.trim();
      const resolvedName =
        (existingName && existingName.length > 0 ? existingName : undefined) ??
        heroMap.get(sub.heroid) ??
        `Herói #${sub.heroid}`;
      const existingHead = sub.hero?.data?.head;
      return {
        ...sub,
        name: resolvedName,
        hero: {
          ...(sub.hero ?? {}),
          data: {
            ...(sub.hero?.data ?? {}),
            name: resolvedName,
            ...(existingHead !== undefined ? { head: existingHead } : {}),
          },
        },
      };
    };

    const resolvedSubHero = rawData.sub_hero.map(resolveSubHero);
    const resolvedSubHeroLast = rawData.sub_hero_last?.map(resolveSubHero);
    const mainHeroName =
      rawData.main_hero?.data.name.trim() ??
      heroMap.get(rawData.main_heroid) ??
      `Herói #${rawData.main_heroid}`;

    return {
      metadata: rawResponse.metadata,
      data: {
        ...rawData,
        id: String(rawData.main_heroid),
        heroId: rawData.main_heroid,
        name: mainHeroName,
        sub_hero: resolvedSubHero,
        counters: resolvedSubHero,
        // Always assigned so the raw (unresolved) sub_hero_last from ...rawData never leaks through.
        sub_hero_last: resolvedSubHeroLast,
      },
    };
  }

  async findHero(query: string): Promise<ProviderResponse<HeroSummary | undefined>> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new MLBBProviderError(
        'INVALID_INPUT',
        'Hero query cannot be empty',
        '⚠️ Informe o nome ou ID do herói.'
      );
    }
    const result = await this.listHeroes();
    const lower = trimmed.toLocaleLowerCase('pt-BR');
    return {
      ...result,
      data: result.data.find(
        hero =>
          hero.id === trimmed ||
          String(hero.hero_id) === trimmed ||
          hero.name.toLocaleLowerCase('pt-BR') === lower
      ),
    };
  }

  private validateInput<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? 'Invalid input parameters';
      throw new MLBBProviderError(
        'INVALID_INPUT',
        `Invalid parameter: ${issue}`,
        '⚠️ Parâmetros de consulta inválidos. Verifique o filtro de dias, elo ou ordenação.',
        { cause: parsed.error }
      );
    }
    return parsed.data as z.infer<S>;
  }

  private async tryLoadHeroMap(lang: string): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    try {
      const heroes = await this.listHeroes({ lang });
      for (const h of heroes.data) {
        map.set(h.hero_id, h.name);
      }
    } catch {
      // Fallback to Herói #<id> when hero list cannot be fetched
    }
    return map;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private safeUrl(path: string): string {
    const url = new URL(path, 'https://arena.rone.dev');
    if (url.origin !== 'https://arena.rone.dev' || url.username || url.password) {
      throw new MLBBProviderError(
        'INVALID_INPUT',
        'Alternative endpoint must use the Arena origin',
        '⚠️ Endpoint inválido.'
      );
    }
    return url.href;
  }

  private buildUrl(
    path: string,
    query: Record<string, string | number | undefined>
  ): string {
    const baseHref = this.safeUrl(path);
    const url = new URL(baseHref);
    const pairs: string[] = [];
    if (url.search.length > 1) {
      pairs.push(url.search.slice(1));
    }
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    url.search = pairs.length > 0 ? `?${pairs.join('&')}` : '';
    return url.href;
  }

  private async readDiskCache(): Promise<DiskCache> {
    try {
      const raw = JSON.parse(await readFile(this.cachePath, 'utf8')) as unknown;
      const parsed = diskCacheSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // Missing or corrupt cache is treated as a cache miss.
    }
    return { entries: {} };
  }

  private async writeDiskCacheEntry(key: string, entry: CachedItem): Promise<void> {
    this.memoryCache.set(key, entry);
    try {
      const disk = await this.readDiskCache();
      disk.entries[key] = entry;
      await mkdir(dirname(this.cachePath), { recursive: true });
      const temp = `${this.cachePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(disk), { flag: 'wx', mode: 0o600 });
        await rename(temp, this.cachePath);
      } finally {
        await rm(temp, { force: true });
      }
    } catch {
      // Ignore disk write failure; memory cache still holds the entry.
    }
  }

  private async getCachedEntry(key: string): Promise<CachedItem | undefined> {
    const disk = await this.readDiskCache();
    const fromDisk = disk.entries[key];
    if (fromDisk) {
      this.memoryCache.set(key, fromDisk);
      return fromDisk;
    }
    return this.memoryCache.get(key);
  }

  private parseEnvelope<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
    if (typeof body === 'object' && body !== null && 'code' in body) {
      const rawCode = (body as { code?: unknown }).code;
      if (typeof rawCode === 'number' && rawCode !== 0) {
        const rawMsg = (body as { message?: unknown }).message;
        const msgStr = typeof rawMsg === 'string' ? rawMsg : 'Upstream error';
        throw new MLBBProviderError(
          'UPSTREAM_ERROR',
          `Arena API error code ${rawCode}: ${msgStr}`,
          '❌ A API do MLBB retornou um erro ao processar a consulta.'
        );
      }
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new MLBBProviderError(
        'INVALID_RESPONSE',
        `Invalid Arena response: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`,
        '❌ A resposta da API do MLBB veio em um formato inesperado.',
        { cause: parsed.error }
      );
    }
    return parsed.data as z.infer<S>;
  }

  private async request(url: string) {
    const minInterval = this.options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    const wait =
      this.lastRequest === undefined
        ? 0
        : Math.max(0, minInterval - (this.now() - this.lastRequest));
    if (wait > 0) await this.sleep(wait);
    this.lastRequest = this.now();

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      return await Promise.race([
        this.client.get(url, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new MLBBProviderError(
                'TIMEOUT',
                `Arena request timeout after ${timeoutMs}ms`,
                '⏳ O serviço de dados do MLBB demorou muito para responder. Tente novamente em instantes.'
              )
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async fetchWithCache<S extends z.ZodTypeAny, R>(
    initialUrl: string,
    schema: S,
    transform: (envelope: z.infer<S>) => R
  ): Promise<ProviderResponse<R>> {
    const ttlMs = this.options.ttlMs ?? DEFAULT_TTL_MS;
    const cached = await this.getCachedEntry(initialUrl);
    let cachedData: R | undefined;

    if (cached) {
      try {
        cachedData = transform(this.parseEnvelope(schema, cached.body));
      } catch {
        cachedData = undefined;
      }
    }

    if (
      cached &&
      cachedData !== undefined &&
      this.now() >= Date.parse(cached.collectedAt) &&
      this.now() - Date.parse(cached.collectedAt) < ttlMs
    ) {
      return {
        data: cachedData,
        metadata: {
          source: cached.source,
          collectedAt: cached.collectedAt,
          stale: false,
        },
      };
    }

    let url = initialUrl;
    try {
      let response = await this.request(url);
      if (response.status === 503) {
        if (cached && cachedData !== undefined) {
          return {
            data: cachedData,
            metadata: {
              source: cached.source,
              collectedAt: cached.collectedAt,
              stale: true,
            },
          };
        }
        const alternative = z.object({ alternative_endpoint: z.string() }).safeParse(response.body);
        if (alternative.success) {
          url = this.safeUrl(alternative.data.alternative_endpoint);
          response = await this.request(url);
        }
      }

      if (response.status === 404) {
        throw new MLBBProviderError(
          'NOT_FOUND',
          `Arena HTTP 404 for ${url}`,
          '🔍 Herói ou recurso não encontrado.',
          { status: 404 }
        );
      }

      if (response.status !== 200) {
        throw new MLBBProviderError(
          'UPSTREAM_ERROR',
          `Arena HTTP ${response.status}`,
          response.status === 503
            ? '🚧 O serviço Rone Arena está com alto tráfego no momento. Tente novamente em alguns minutos.'
            : '❌ Serviço de dados do MLBB indisponível no momento.',
          { status: response.status }
        );
      }

      const envelope = this.parseEnvelope(schema, response.body);
      const data = transform(envelope);
      const collectedAt = new Date(this.now()).toISOString();
      const entry: CachedItem = {
        source: url,
        collectedAt,
        body: response.body,
      };
      await this.writeDiskCacheEntry(initialUrl, entry);

      return {
        data,
        metadata: {
          source: url,
          collectedAt,
          stale: false,
        },
      };
    } catch (error) {
      if (cached && cachedData !== undefined) {
        return {
          data: cachedData,
          metadata: {
            source: cached.source,
            collectedAt: cached.collectedAt,
            stale: true,
          },
        };
      }
      throw error;
    }
  }
}
