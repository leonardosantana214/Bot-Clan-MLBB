import { noArguments, type CommandDefinition } from '../command-registry.js';
export const ajuda: CommandDefinition = { name: 'ajuda', input: noArguments, async handle() { return '/ping · /ajuda · /registrar <nome> · /perfil · /xp'; } };
