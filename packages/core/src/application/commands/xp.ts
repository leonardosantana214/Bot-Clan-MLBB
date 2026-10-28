import { calculateLevel, xpBalance } from '../../domain/models.js';
import { noArguments, type CommandDefinition } from '../command-registry.js';
export const xp: CommandDefinition = { name: 'xp', input: noArguments, async handle({ members, ledger, message, levelFormula }) {
  const member = await members.findByIdentity(message.senderId);
  if (!member) return 'Use /registrar <nome> primeiro.';
  const total = xpBalance(await ledger.list(member.id));
  return `XP: ${total} · Nível: ${calculateLevel(total, levelFormula)}`;
} };
