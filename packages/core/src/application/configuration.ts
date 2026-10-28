import { calculateLevel, defaultLevelFormula } from '../domain/models.js';
import { defaultXpPolicy, XpAntiflood } from './xp-antiflood.js';
import type { PersonaStyle } from './persona.js';
/** Explicit host opt-ins. Proposta / pendente de aprovacao. No process-global reads in core. */
export function progressionConfiguration(env: Readonly<Record<string, string | undefined>>) {
  const number = (name: string, fallback: number) => {
    const value = env[name];
    if (value === undefined) return fallback;
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`Invalid ${name}`);
    return Number(value);
  };
  const xpPolicy = { enabled: env.AEROBOT_XP_ENABLED === '1',
    award: number('AEROBOT_XP_AWARD', defaultXpPolicy.award),
    dailyCap: number('AEROBOT_XP_DAILY_CAP', defaultXpPolicy.dailyCap),
    minIntervalMs: number('AEROBOT_XP_MIN_INTERVAL_MS', defaultXpPolicy.minIntervalMs) };
  XpAntiflood.validatePolicy(xpPolicy);
  const levelFormula = { baseXp: number('AEROBOT_LEVEL_BASE_XP', defaultLevelFormula.baseXp), exponent: number('AEROBOT_LEVEL_EXPONENT', defaultLevelFormula.exponent) };
  calculateLevel(0, levelFormula);
  const persona: PersonaStyle = env.AEROBOT_PERSONA === 'conselheiro' ? 'conselheiro' : 'neutro';
  return { xpPolicy, levelFormula, persona };
}
