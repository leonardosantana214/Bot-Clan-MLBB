import { z } from 'zod';
import type { CommandDefinition } from '@aerobot/core';
import {
  daysSchema,
  formatMeta,
  formatProviderError,
  rankSchema,
  type MLBBProvider,
  type MetaDays,
  type MetaRank,
} from '@aerobot/mlbb-provider';
import { MAX_USER_INPUT_LENGTH, hasControlChars, safeTokenSchema } from './validation.js';

export const META_TOP_N = 5;
export const META_DEFAULT_DAYS: MetaDays = 7;
export const META_DEFAULT_RANK: MetaRank = 'all';

export const META_USAGE_MESSAGE =
  '⚠️ Argumentos inválidos. Uso correto: /meta [dias] [rank] (dias: 1, 3, 7, 15, 30 | rank: all, epic, legend, mythic, honor, glory).';

const dayTokenSchema = z
  .string()
  .trim()
  .regex(/^\d+$/u)
  .transform(Number)
  .pipe(daysSchema);

const rankTokenSchema = z
  .string()
  .trim()
  .transform(value => value.toLowerCase())
  .pipe(rankSchema);

export const metaArgsSchema = z
  .array(safeTokenSchema)
  .max(2)
  .refine(parts => {
    const joined = parts.join(' ');
    return joined.length <= MAX_USER_INPUT_LENGTH && !hasControlChars(joined);
  })
  .transform((parts, ctx): { days: MetaDays; rank: MetaRank } => {
    let days: MetaDays = META_DEFAULT_DAYS;
    let rank: MetaRank = META_DEFAULT_RANK;

    if (parts[0] !== undefined) {
      const parsedDays = dayTokenSchema.safeParse(parts[0]);
      if (!parsedDays.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Filtro de dias inválido.',
        });
        return z.NEVER;
      }
      days = parsedDays.data;
    }

    if (parts[1] !== undefined) {
      const parsedRank = rankTokenSchema.safeParse(parts[1]);
      if (!parsedRank.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Filtro de rank inválido.',
        });
        return z.NEVER;
      }
      rank = parsedRank.data;
    }

    return { days, rank };
  });

export function createMetaCommand(provider: MLBBProvider): CommandDefinition {
  return {
    name: 'meta',
    description: 'Consulta o meta por período e elo. Uso: /meta [dias] [rank]',
    input: z.array(z.string()),
    async handle(_context, args) {
      const parsed = metaArgsSchema.safeParse(args);
      if (!parsed.success) {
        return META_USAGE_MESSAGE;
      }

      const { days, rank } = parsed.data;
      try {
        const result = await provider.getMeta({
          days,
          rank,
          size: META_TOP_N,
        });
        return formatMeta(result, {
          topN: META_TOP_N,
          days,
          rank,
        });
      } catch (error) {
        return formatProviderError(error);
      }
    },
  };
}
