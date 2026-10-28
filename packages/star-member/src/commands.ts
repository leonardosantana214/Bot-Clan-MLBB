import { z } from 'zod';
import type { CommandContext, CommandDefinition } from '@aerobot/core';
import { categories } from './model.js';
import type { Category } from './model.js';
import type { StarMember } from './service.js';

const noArgs = z.array(z.string()).length(0);
export const adminCommandNames = ['pontuar', 'fecharestrela', 'sortearestrela', 'aprovarsorteio', 'desempatar'] as const;
function command(name: string, description: string, input: CommandDefinition['input'], handle: CommandDefinition['handle']): CommandDefinition {
  return { name, description, input, handle: async (context, args) => {
    try { return await handle(context, args); }
    catch (error) { return error instanceof Error && !(error instanceof z.ZodError) ? error.message : 'Argumentos inválidos.'; }
  } };
}
async function ownId(context: CommandContext): Promise<string | undefined> {
  const member = await context.members.findByIdentity(context.message.senderId);
  return member && (member.status === 'active' || member.status === 'inactive') ? member.id : undefined;
}
/** The host MUST allow these commands exclusively on its administration group route. */
export function adminCommands(service: StarMember): readonly CommandDefinition[] {
  return [
    command('pontuar', 'Lança pontos com justificativa.', z.array(z.string()).min(4), async (ctx, args) => {
      const [memberId, category, points, ...reason] = args;
      await service.score({ memberId: memberId!, category: z.enum(categories).parse(category) as Category, points: Number(points), reason: reason.join(' ') }, ctx.message.senderId);
      return 'Pontuação registrada.';
    }),
    command('fecharestrela', 'Fecha o mês e congela os pontos.', noArgs, async ctx => {
      const snapshot = await service.close(ctx.message.senderId);
      return snapshot.merit.status === 'empate pendente' ? 'Mês fechado. Mérito: empate pendente de decisão dos ADMs.' : 'Mês fechado.';
    }),
    command('sortearestrela', 'Sorteia entre os elegíveis do mês fechado.', noArgs, async ctx => {
      await service.raffle(ctx.message.senderId); return 'Sorteio registrado. Pendente de aprovação.';
    }),
    command('aprovarsorteio', 'Aprova a publicação do sorteio.', noArgs, async ctx => {
      service.approve(ctx.message.senderId); return 'Sorteio aprovado e publicado.';
    }),
    command('desempatar', 'Registra a decisão dos ADMs sobre o mérito.', z.array(z.string()).min(2), async (ctx, args) => {
      service.resolveTie(args[0]!, ctx.message.senderId, args.slice(1).join(' ')); return 'Decisão de mérito registrada.';
    })
  ];
}
export function memberCommands(service: StarMember): readonly CommandDefinition[] {
  return [
    command('estrela', 'Mostra seus pontos e elegibilidade no mês.', noArgs, async ctx => {
      const id = await ownId(ctx);
      if (!id) return 'Cadastro não habilitado.';
      const own = await service.own(id);
      if (!own.standing) return 'Sem pontuação neste mês.';
      return categories.map(c => c + ': ' + own.standing!.points[c]).join(' | ') + '. Total: ' + own.standing.total + '. ' + (own.eligible ? 'Elegível.' : 'Ainda não elegível.');
    }),
    command('historicoestrela', 'Mostra seu histórico e vencedores publicados.', noArgs, async ctx => {
      const id = await ownId(ctx);
      if (!id) return 'Cadastro não habilitado.';
      return service.history(id).map(h => h.period + ': seus pontos ' + (h.total ?? 0) + (h.meritWinner ? '; mérito: ' + h.meritWinner : '') + (h.raffleWinner ? '; sorteio: ' + h.raffleWinner : '')).join('\n') || 'Sem meses anteriores fechados.';
    })
  ];
}
export function createStarCommands(service: StarMember): { memberCommands: readonly CommandDefinition[]; adminCommands: readonly CommandDefinition[] } {
  return { memberCommands: memberCommands(service), adminCommands: adminCommands(service) };
}
