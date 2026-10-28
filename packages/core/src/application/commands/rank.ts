import { z } from 'zod';
import type { CommandContext, CommandDefinition } from '../command-registry.js';
import { rankByPeriod, rankPeriodBounds, type RankEntry, type RankPeriod } from '../ranking.js';

export async function rankResponse({ members, ledger, clock, message }: CommandContext, period: RankPeriod): Promise<string> {
  if (!members.list) return 'Ranking indisponível neste armazenamento.';
  const { start, end } = rankPeriodBounds(period, clock.now());
  const entries = await rankByPeriod(members, ledger, start, end);
  if (!entries.length) return 'Ranking sem membros registrados.';
  const format = (entry: RankEntry) => `${entry.position}º · ${entry.member.name} · ${entry.xp.toLocaleString('pt-BR')} XP`;
  const own = await members.findByIdentity(message.senderId);
  const ownEntry = entries.find(entry => entry.member.id === own?.id);
  const lines = [`Ranking · ${period === 'mes' ? 'mês' : period}`, ...entries.slice(0, 10).map(format)];
  if (ownEntry && ownEntry.position > 10) lines.push(`Sua posição: ${format(ownEntry)}`);
  return lines.join('\n');
}
export const rank: CommandDefinition = {
  name: 'rank', description: 'Ranking de XP: semana (padrão), mes ou geral.',
  input: z.array(z.enum(['semana', 'mes', 'geral'])).max(1),
  async handle(context, args) { return rankResponse(context, (args[0] ?? 'semana') as RankPeriod); }
};
