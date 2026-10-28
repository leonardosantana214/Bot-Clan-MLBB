import { noArguments, type CommandDefinition } from '../command-registry.js';
import { rankResponse } from './rank.js';
export const top: CommandDefinition = {
  name: 'top', description: 'Mostra o ranking geral de XP.', input: noArguments,
  async handle(context) { return rankResponse(context, 'geral'); }
};
