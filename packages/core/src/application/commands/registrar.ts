import { displayName } from '../display-name.js';
import { z } from 'zod';
import type { CommandDefinition } from '../command-registry.js';
export const registrar: CommandDefinition = {
  name: 'registrar', description: 'Registra seu nome.', input: z.array(z.string().min(1).max(80)).min(1).max(8).refine(parts => parts.join(' ').length <= 80),
  async handle({ message, members, clock, audit }, args) {
    const member = { id: `aero:${message.senderId}`, name: args.join(' '), identities: [{ platformUserId: message.senderId }], status: 'active' as const, registeredAt: clock.now() };
    if (!await members.register(member)) return 'Você já está registrado.';
    await audit.record({ action: 'member.registered', actorId: message.senderId, subjectId: member.id, at: clock.now() });
    return `Registro criado: ${displayName(member.name)}.`;
  }
};
