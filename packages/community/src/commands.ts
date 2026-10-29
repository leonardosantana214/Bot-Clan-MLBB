import { z } from 'zod';
import { noArguments, type AuditLog, type Clock, type CommandDefinition, type CommandContext, type Member } from '@aerobot/core';
import type { CommunityStore, NotificationGateway } from './ports.js';
import { defaultIdGenerator, formatDate, sanitizeText, shortHash, type IdGenerator } from './text.js';

export interface CommunityCommandsDeps {
  store: CommunityStore; clock: Clock; adminGroupId: string; notifier?: NotificationGateway; newId?: IdGenerator;
}
export interface CommunityCommands {
  /**
   * Register ONLY in the administration route (route.allowedCommands of the admin group).
   * Authorization is per route: the core registry only checks the group's allowedCommands,
   * so whoever can write in the admin group is treated as ADM. As defense in depth these
   * commands also refuse to run outside `adminGroupId`.
   */
  readonly adminCommands: readonly CommandDefinition[];
  /** Safe for CHAT routes: members only see their own data. */
  readonly memberCommands: readonly CommandDefinition[];
}

const RESTRICTED = 'Comando restrito à administração.';
const MAX_LISTED = 10;

async function findById(context: CommandContext, aeroId: string): Promise<Member | undefined> {
  const all = await context.members.list?.();
  return all?.find(m => m.id === aeroId);
}

export function createCommunityCommands(deps: CommunityCommandsDeps): CommunityCommands {
  const newId = deps.newId ?? defaultIdGenerator;

  const advertir: CommandDefinition = {
    name: 'advertir', description: 'ADM: registra advertência. Uso: /advertir <aeroId> <motivo>',
    input: z.array(z.string().min(1).max(200)).min(2).max(40),
    async handle(context, [aeroId, ...words]) {
      if (context.message.groupId !== deps.adminGroupId) return RESTRICTED;
      const author = await context.members.findByIdentity(context.message.senderId);
      if (!author) return 'Cadastro necessário para registrar advertências.';
      if (!context.members.list) return 'Consulta de membros indisponível.';
      const target = await findById(context, aeroId ?? '');
      if (!target) return 'Membro não encontrado.';
      const reason = sanitizeText(words.join(' '), 200);
      if (!reason) return 'Informe um motivo.';
      const at = deps.clock.now();
      await deps.store.appendWarning({ id: newId(), memberId: target.id, reason, authorId: author.id, authorName: sanitizeText(author.name, 40), at });
      await context.audit.record({ action: 'warning.issued', actorId: author.id, subjectId: target.id, at });
      const total = (await deps.store.listWarnings(target.id)).length;
      await deps.notifier?.notify({ id: `warning:${shortHash(`${target.id}:${at}:${total}`, 16)}`, type: 'moderation', at, line: `advertência registrada para ${sanitizeText(target.name, 40)} por ${sanitizeText(author.name, 40)} (total ${total})` });
      return `Advertência registrada para ${sanitizeText(target.name, 40)}. Total: ${total}.`;
    }
  };

  const advertencias: CommandDefinition = {
    name: 'advertencias', description: 'ADM: lista advertências. Uso: /advertencias <aeroId>',
    input: z.array(z.string().min(1).max(200)).length(1),
    async handle(context, [aeroId]) {
      if (context.message.groupId !== deps.adminGroupId) return RESTRICTED;
      if (!context.members.list) return 'Consulta de membros indisponível.';
      const target = await findById(context, aeroId ?? '');
      if (!target) return 'Membro não encontrado.';
      return formatWarnings(`Advertências de ${sanitizeText(target.name, 40)}`, await deps.store.listWarnings(target.id), true);
    }
  };

  const minhasadvertencias: CommandDefinition = {
    name: 'minhasadvertencias', description: 'Orienta a consulta privada à liderança.', input: noArguments,
    async handle(context) {
      const member = await context.members.findByIdentity(context.message.senderId);
      if (!member) return 'Use /registrar <nome> primeiro.';
      if (context.message.groupId !== deps.adminGroupId) return 'Consulte a liderança para acessar os detalhes das suas advertências.';
      return formatWarnings('Suas advertências', await deps.store.listWarnings(member.id), false);
    }
  };

  return { adminCommands: [advertir, advertencias], memberCommands: [minhasadvertencias] };
}

function formatWarnings(title: string, warnings: readonly { at: number; reason: string; authorName: string }[], showAuthor: boolean): string {
  if (warnings.length === 0) return `${title}: nenhuma.`;
  const shown = warnings.slice(-MAX_LISTED);
  const lines = shown.map((w, i) => `${warnings.length - shown.length + i + 1}. ${formatDate(w.at)} - ${w.reason}${showAuthor ? ` (por ${w.authorName})` : ''}`);
  const more = warnings.length > shown.length ? `\n(mostrando as ${shown.length} mais recentes)` : '';
  return `${title} (${warnings.length}):\n${lines.join('\n')}${more}`;
}

export type { AuditLog };
