import { noArguments, type CommandDefinition } from '../command-registry.js';
export const ping: CommandDefinition = { name: 'ping', description: 'Verifica se o bot está online.', input: noArguments, async handle() { return 'pong'; } };
