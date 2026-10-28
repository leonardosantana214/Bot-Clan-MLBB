import { noArguments, type CommandDefinition } from '../command-registry.js';
export const ping: CommandDefinition = { name: 'ping', input: noArguments, async handle() { return 'pong'; } };
