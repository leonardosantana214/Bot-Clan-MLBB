export const ATTRIBUTION =
  'Hero/meta data: Rone Arena (https://arena.rone.dev). Mobile Legends: Bang Bang and game assets: Moonton. Unofficial integration.';

export const SHORT_ATTRIBUTION = 'Fonte: Rone Arena • MLBB © Moonton (não oficial)';

export const STALE_WARNING = '⚠️ Dados em cache (podem estar desatualizados).';

export type ProviderErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE';

export class MLBBProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly userMessage: string;
  readonly status?: number | undefined;

  constructor(
    code: ProviderErrorCode,
    message: string,
    userMessage: string,
    options?: { status?: number | undefined; cause?: unknown }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'MLBBProviderError';
    this.code = code;
    this.userMessage = userMessage;
    this.status = options?.status;
  }
}

export interface FormatMetadata {
  source?: string | undefined;
  collectedAt?: string | undefined;
  stale?: boolean | undefined;
}

export interface FormattedEnvelope<T> {
  data: T;
  metadata?: FormatMetadata | undefined;
}

export interface FormattableSkill {
  skillid?: number | undefined;
  skillname?: string | undefined;
  'skillcd&cost'?: string | undefined;
  skilldesc?: string | undefined;
  skilltag?: ReadonlyArray<{ tagname?: string | undefined }> | undefined;
}

export interface FormattableHeroDetail {
  hero_id: number;
  name?: string | undefined;
  roles?: readonly string[] | undefined;
  lanes?: readonly string[] | undefined;
  specialities?: readonly string[] | undefined;
  difficulty?: string | undefined;
  story?: string | undefined;
  hero?: {
    data: {
      name: string;
      difficulty?: string | undefined;
      story?: string | undefined;
      sortlabel?: readonly string[] | undefined;
      roadsortlabel?: readonly string[] | undefined;
      speciality?: readonly string[] | undefined;
      heroskilllist?: ReadonlyArray<{
        skilllist?: readonly FormattableSkill[] | undefined;
      }> | undefined;
    };
  } | undefined;
  relation?: {
    assist?: { desc?: string | undefined; target_hero_id?: readonly number[] | undefined } | undefined;
    strong?: { desc?: string | undefined; target_hero_id?: readonly number[] | undefined } | undefined;
    weak?: { desc?: string | undefined; target_hero_id?: readonly number[] | undefined } | undefined;
  } | undefined;
}

export interface FormattableMetaEntry {
  main_heroid: number;
  name?: string | undefined;
  main_hero?: {
    data: {
      name: string;
    };
  } | undefined;
  main_hero_win_rate: number;
  main_hero_ban_rate: number;
  main_hero_appearance_rate: number;
}

export interface FormattableCounterItem {
  heroid: number;
  name?: string | undefined;
  hero?: {
    data?: {
      name?: string | undefined;
    } | undefined;
  } | undefined;
  increase_win_rate: number;
  hero_win_rate?: number | undefined;
  hero_appearance_rate?: number | undefined;
}

export interface FormattableCounters {
  main_heroid: number;
  name?: string | undefined;
  main_hero?: {
    data?: {
      name?: string | undefined;
    } | undefined;
  } | undefined;
  main_hero_win_rate: number;
  main_hero_ban_rate: number;
  main_hero_appearance_rate: number;
  sub_hero: readonly FormattableCounterItem[];
}

export interface FormatHeroInfoOptions {
  stale?: boolean | undefined;
  includeSkills?: boolean | undefined;
  maxSkills?: number | undefined;
}

export interface FormatMetaOptions {
  topN?: number | undefined;
  stale?: boolean | undefined;
  rank?: string | undefined;
  days?: number | undefined;
}

export interface FormatCountersOptions {
  topN?: number | undefined;
  stale?: boolean | undefined;
}

const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;
const HTML_TAG_REGEX = /<[^>]*>/g;
const IMAGE_URL_REGEX = /https?:\/\/[^\s)]*(?:wsrv\.nl|youngjoygame\.com|\.(?:png|jpg|jpeg|webp|gif|svg))[^\s)]*/gi;
const MENTION_REGEX = /@+/g;

/**
 * Sanitizes text coming from the external API for safe display on WhatsApp:
 * - Removes HTML tags (such as `<font color="...">`)
 * - Removes wsrv.nl / asset image URLs
 * - Strips control and invisible formatting characters
 * - Neutralizes `@mentions` (`@user`, `@12345`, `@everyone`)
 * - Collapses excessive whitespace and truncates to `maxLength`
 */
export function sanitizeApiText(raw: string | undefined | null, maxLength = 280): string {
  if (!raw) return '';
  const limit = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 280;
  const cleaned = raw
    .replace(HTML_TAG_REGEX, ' ')
    .replace(IMAGE_URL_REGEX, '')
    .replace(CONTROL_CHARS_REGEX, ' ')
    .replace(MENTION_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

export const cleanApiText = sanitizeApiText;

/**
 * Formats a 0–1 rate fraction as a PT-BR percentage with 1 decimal place (e.g., 0.613522 -> "61,4%").
 */
export function formatPercentPtBr(rate: number): string {
  if (!Number.isFinite(rate)) return '0,0%';
  const pct = rate * 100;
  return `${pct.toFixed(1).replace('.', ',')}%`;
}

/**
 * Formats a 0–1 win-rate delta fraction as percentage points in PT-BR (e.g., 0.028926 -> "+2,9 pp").
 */
export function formatPpPtBr(deltaRate: number): string {
  if (!Number.isFinite(deltaRate)) return '+0,0 pp';
  const pp = deltaRate * 100;
  const sign = pp >= 0 ? '+' : '';
  return `${sign}${pp.toFixed(1).replace('.', ',')} pp`;
}

function isEnvelope<T>(
  input: T | FormattedEnvelope<T>
): input is FormattedEnvelope<T> {
  return (
    typeof input === 'object' &&
    input !== null &&
    'data' in input &&
    !('hero_id' in input) &&
    !('main_heroid' in input) &&
    !Array.isArray(input)
  );
}

function cleanList(items: readonly string[] | undefined): string[] {
  if (!items) return [];
  const result: string[] = [];
  for (const item of items) {
    const cleaned = sanitizeApiText(item, 40);
    if (cleaned) result.push(cleaned);
  }
  return result;
}

/**
 * Formats detailed hero information into a ready-to-send PT-BR WhatsApp text.
 */
export function formatHeroInfo(
  input: FormattableHeroDetail | FormattedEnvelope<FormattableHeroDetail>,
  options?: FormatHeroInfoOptions
): string {
  const detail = isEnvelope(input) ? input.data : input;
  const stale = options?.stale ?? (isEnvelope(input) ? Boolean(input.metadata?.stale) : false);

  const rawName = detail.name ?? detail.hero?.data.name ?? `Herói #${detail.hero_id}`;
  const name = sanitizeApiText(rawName, 60) || `Herói #${detail.hero_id}`;

  const roles = cleanList(detail.roles ?? detail.hero?.data.sortlabel);
  const lanes = cleanList(detail.lanes ?? detail.hero?.data.roadsortlabel);
  const specialities = cleanList(detail.specialities ?? detail.hero?.data.speciality);
  const difficulty = sanitizeApiText(detail.difficulty ?? detail.hero?.data.difficulty, 20);
  const story = sanitizeApiText(detail.story ?? detail.hero?.data.story, 220);

  const lines: string[] = [`🦸 *${name}* (ID: ${detail.hero_id})`];

  const metaParts: string[] = [];
  if (roles.length > 0) metaParts.push(`Função: ${roles.join(', ')}`);
  if (lanes.length > 0) metaParts.push(`Rota: ${lanes.join(', ')}`);
  if (metaParts.length > 0) lines.push(metaParts.join(' | '));

  const extraParts: string[] = [];
  if (specialities.length > 0) extraParts.push(`Especialidade: ${specialities.join(', ')}`);
  if (difficulty) extraParts.push(`Dificuldade: ${difficulty}`);
  if (extraParts.length > 0) lines.push(extraParts.join(' | '));

  if (story) {
    lines.push(`📖 ${story}`);
  }

  const includeSkills = options?.includeSkills ?? true;
  const maxSkills = options?.maxSkills ?? 4;
  const skillGroups = detail.hero?.data.heroskilllist ?? [];
  const rawSkills = skillGroups[0]?.skilllist ?? [];

  if (includeSkills && rawSkills.length > 0) {
    const skillLines: string[] = [];
    for (const skill of rawSkills.slice(0, maxSkills)) {
      const skillName = sanitizeApiText(skill.skillname, 50);
      if (!skillName) continue;
      const skillDesc = sanitizeApiText(skill.skilldesc, 140);
      const cdCost = sanitizeApiText(skill['skillcd&cost'], 40);
      const cdSuffix = cdCost ? ` (${cdCost})` : '';
      skillLines.push(
        skillDesc ? `• *${skillName}*${cdSuffix}: ${skillDesc}` : `• *${skillName}*${cdSuffix}`
      );
    }
    if (skillLines.length > 0) {
      lines.push('', '*Habilidades:*', ...skillLines);
    }
  }

  const strongDesc = sanitizeApiText(detail.relation?.strong?.desc, 180);
  const weakDesc = sanitizeApiText(detail.relation?.weak?.desc, 180);
  const assistDesc = sanitizeApiText(detail.relation?.assist?.desc, 180);

  if (strongDesc || weakDesc || assistDesc) {
    lines.push('', '*Relações:*');
    if (strongDesc) lines.push(`✅ Forte contra: ${strongDesc}`);
    if (weakDesc) lines.push(`⚠️ Fraco contra: ${weakDesc}`);
    if (assistDesc) lines.push(`🤝 Sinergia: ${assistDesc}`);
  }

  lines.push('');
  if (stale) lines.push(STALE_WARNING);
  lines.push(SHORT_ATTRIBUTION);

  return lines.join('\n');
}

/**
 * Formats the hero meta ranking list (top N) with PT-BR percentages for WhatsApp.
 */
export function formatMeta(
  input: readonly FormattableMetaEntry[] | FormattedEnvelope<readonly FormattableMetaEntry[]>,
  optionsOrTopN?: number | FormatMetaOptions
): string {
  const entries = isEnvelope(input) ? input.data : input;
  const opts: FormatMetaOptions =
    typeof optionsOrTopN === 'number' ? { topN: optionsOrTopN } : (optionsOrTopN ?? {});
  const stale = opts.stale ?? (isEnvelope(input) ? Boolean(input.metadata?.stale) : false);
  const topN = opts.topN !== undefined && opts.topN > 0 ? Math.floor(opts.topN) : 10;

  const headerParts = ['🏆 *Meta MLBB*'];
  if (opts.rank) headerParts.push(`Elo: ${sanitizeApiText(opts.rank, 20)}`);
  if (opts.days) headerParts.push(`${opts.days}d`);

  const lines: string[] = [headerParts.join(' — ')];

  const sliced = entries.slice(0, topN);
  if (sliced.length === 0) {
    lines.push('Nenhum dado de meta disponível no momento.');
  } else {
    sliced.forEach((entry, idx) => {
      const rawName =
        entry.name ?? entry.main_hero?.data.name ?? `Herói #${entry.main_heroid}`;
      const name = sanitizeApiText(rawName, 50) || `Herói #${entry.main_heroid}`;
      const wr = formatPercentPtBr(entry.main_hero_win_rate);
      const ban = formatPercentPtBr(entry.main_hero_ban_rate);
      const pick = formatPercentPtBr(entry.main_hero_appearance_rate);
      lines.push(`${idx + 1}. *${name}* — WR: ${wr} | Ban: ${ban} | Pick: ${pick}`);
    });
  }

  lines.push('');
  if (stale) lines.push(STALE_WARNING);
  lines.push(SHORT_ATTRIBUTION);

  return lines.join('\n');
}

/**
 * Formats the best counters for a hero with `+x,x pp` in PT-BR for WhatsApp.
 */
export function formatCounters(
  input: FormattableCounters | FormattedEnvelope<FormattableCounters>,
  optionsOrTopN?: number | FormatCountersOptions
): string {
  const data = isEnvelope(input) ? input.data : input;
  const opts: FormatCountersOptions =
    typeof optionsOrTopN === 'number' ? { topN: optionsOrTopN } : (optionsOrTopN ?? {});
  const stale = opts.stale ?? (isEnvelope(input) ? Boolean(input.metadata?.stale) : false);
  const topN = opts.topN !== undefined && opts.topN > 0 ? Math.floor(opts.topN) : 5;

  const rawMainName =
    data.name ?? data.main_hero?.data?.name ?? `Herói #${data.main_heroid}`;
  const mainName = sanitizeApiText(rawMainName, 50) || `Herói #${data.main_heroid}`;
  const mainWr = formatPercentPtBr(data.main_hero_win_rate);

  const lines: string[] = [`🛡️ *Melhores Counters contra ${mainName}* (WR base: ${mainWr})`];

  const counters = data.sub_hero.slice(0, topN);
  if (counters.length === 0) {
    lines.push('Nenhum counter encontrado para este herói.');
  } else {
    counters.forEach((counter, idx) => {
      const rawCounterName =
        counter.name ?? counter.hero?.data?.name ?? `Herói #${counter.heroid}`;
      const counterName =
        sanitizeApiText(rawCounterName, 50) || `Herói #${counter.heroid}`;
      const pp = formatPpPtBr(counter.increase_win_rate);
      const wrSuffix =
        counter.hero_win_rate !== undefined
          ? ` (WR: ${formatPercentPtBr(counter.hero_win_rate)})`
          : '';
      lines.push(`${idx + 1}. *${counterName}* — ${pp}${wrSuffix}`);
    });
  }

  lines.push('');
  if (stale) lines.push(STALE_WARNING);
  lines.push(SHORT_ATTRIBUTION);

  return lines.join('\n');
}

/**
 * Returns a user-friendly PT-BR error message suitable for WhatsApp without leaking internal details.
 */
export function formatProviderError(error: unknown): string {
  if (error instanceof MLBBProviderError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout')) {
      return '⏳ O serviço de dados do MLBB demorou muito para responder. Tente novamente em instantes.';
    }
    if (msg.includes('not found') || msg.includes('não encontrado') || msg.includes('404')) {
      return '🔍 Herói não encontrado. Verifique o nome ou ID informado.';
    }
    if (msg.includes('invalid') || msg.includes('inválido') || msg.includes('enum')) {
      return '⚠️ Parâmetros de consulta inválidos. Verifique o filtro de dias, elo ou ordenação.';
    }
    if (msg.includes('503') || msg.includes('high traffic')) {
      return '🚧 O serviço Rone Arena está com alto tráfego no momento. Tente novamente em alguns minutos.';
    }
  }
  return '❌ Não foi possível consultar os dados do MLBB no momento. Tente novamente mais tarde.';
}

export const formatError = formatProviderError;
