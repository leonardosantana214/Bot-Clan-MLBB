export interface WhatsAppIdentity { readonly platformUserId: string }
export interface Member {
  readonly id: string;
  readonly name: string;
  readonly identities: readonly WhatsAppIdentity[];
  readonly status: 'pending' | 'active' | 'inactive' | 'left' | 'suspended' | 'deleted';
  readonly registeredAt: number;
}
export interface GroupRoute {
  readonly platformGroupId: string;
  readonly allowedCommands: readonly string[];
}
export interface XpTransaction {
  readonly id: string;
  readonly memberId: string;
  readonly amount: number;
  readonly occurredAt: number;
  readonly source: 'manual' | 'message';
  readonly sourceId: string;
  readonly actorId: string;
  readonly reason: string;
}
export interface LevelFormula { readonly baseXp: number; readonly exponent: number }
// Proposta / pendente de aprovação. See packages/core/README.md for thresholds and migration implications.
export const defaultLevelFormula: LevelFormula = { baseXp: 200, exponent: 2.5 };
// Level zero starts at zero; level n requires ceil(baseXp * n ** exponent).
export function calculateLevel(totalXp: number, formula: LevelFormula = defaultLevelFormula): number {
  if (!Number.isSafeInteger(totalXp) || !Number.isFinite(formula.baseXp) || formula.baseXp < 1 || !Number.isFinite(formula.exponent) || formula.exponent < 1) throw new Error('Invalid XP or level formula');
  const xp = Math.max(0, totalXp);
  let level = Math.floor((xp / formula.baseXp) ** (1 / formula.exponent));
  while (Math.ceil(formula.baseXp * (level + 1) ** formula.exponent) <= xp) level++;
  while (level > 0 && Math.ceil(formula.baseXp * level ** formula.exponent) > xp) level--;
  return level;
}
export function xpBalance(entries: readonly XpTransaction[]): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}
export function levelProgress(totalXp: number, formula: LevelFormula = defaultLevelFormula) {
  const level = calculateLevel(totalXp, formula);
  const currentLevelXp = Math.ceil(formula.baseXp * level ** formula.exponent);
  const nextLevelXp = Math.ceil(formula.baseXp * (level + 1) ** formula.exponent);
  const progress = Math.max(0, Math.min(1, (totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)));
  return { totalXp, level, currentLevelXp, nextLevelXp, progress };
}
