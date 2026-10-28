import { displayName } from '../display-name.js';
import { noArguments, type CommandDefinition } from '../command-registry.js';
export const perfil: CommandDefinition = { name: 'perfil', description: 'Mostra seu perfil.', input: noArguments, async handle({ members, message }) {
  const member = await members.findByIdentity(message.senderId);
  return member ? `${displayName(member.name)} · ${member.status}` : 'Use /registrar <nome> primeiro.';
} };
