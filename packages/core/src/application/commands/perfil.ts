import { noArguments, type CommandDefinition } from '../command-registry.js';
export const perfil: CommandDefinition = { name: 'perfil', input: noArguments, async handle({ members, message }) {
  const member = await members.findByIdentity(message.senderId);
  return member ? `${member.name} · ${member.id} · ${member.status}` : 'Use /registrar <nome> primeiro.';
} };
