import type { CommandDefinition } from '@aerobot/core';
import {
  formatCounters,
  formatProviderError,
  type MLBBProvider,
} from '@aerobot/mlbb-provider';
import { heroQueryArgsSchema, parseHeroQuery } from './validation.js';

export const COUNTER_TOP_N = 5;

export const COUNTER_USAGE_MESSAGE =
  '⚠️ Argumentos inválidos. Uso correto: /counter <nome> (até 40 caracteres, sem caracteres de controle).';

export function createCounterCommand(provider: MLBBProvider): CommandDefinition {
  return {
    name: 'counter',
    input: heroQueryArgsSchema,
    async handle(_context, args) {
      const query = parseHeroQuery(args);
      if (!query) {
        return COUNTER_USAGE_MESSAGE;
      }

      try {
        const result = await provider.getCounters(query, {
          size: COUNTER_TOP_N,
        });
        return formatCounters(result, {
          topN: COUNTER_TOP_N,
        });
      } catch (error) {
        return formatProviderError(error);
      }
    },
  };
}
