import { z } from 'zod';

export const MAX_USER_INPUT_LENGTH = 40;

const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/u;

export function hasControlChars(value: string): boolean {
  return CONTROL_CHARS_REGEX.test(value);
}

export const safeTokenSchema = z
  .string()
  .min(1)
  .max(MAX_USER_INPUT_LENGTH)
  .refine(token => !hasControlChars(token), 'Caracteres de controle não são permitidos.');

export const heroQueryArgsSchema: z.ZodType<readonly string[]> = z
  .array(safeTokenSchema)
  .min(1)
  .refine(parts => {
    const joined = parts.join(' ').trim();
    return (
      joined.length >= 1 &&
      joined.length <= MAX_USER_INPUT_LENGTH &&
      !hasControlChars(joined)
    );
  }, `O nome do herói deve ter até ${MAX_USER_INPUT_LENGTH} caracteres e não conter caracteres de controle.`);

export function parseHeroQuery(args: readonly string[]): string | undefined {
  const parsed = heroQueryArgsSchema.safeParse(args);
  if (!parsed.success) return undefined;
  return parsed.data.join(' ').trim();
}
