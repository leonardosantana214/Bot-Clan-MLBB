import { noArguments, type CommandDefinition } from '../command-registry.js';
export const ajuda: CommandDefinition = {
  name: 'ajuda', description: 'Lista os comandos disponíveis.', input: noArguments,
  async handle({ commands = [] }) {
    return commands.map(command => `/${command.name} · ${command.description ?? 'Sem descrição.'}`).join('\n');
  }
};
