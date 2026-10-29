import type { CommandDefinition } from '@aerobot/core';
import {
  MLBBProviderError,
  formatHeroInfo,
  formatProviderError,
  type MLBBProvider,
} from '@aerobot/mlbb-provider';
import { heroQueryArgsSchema, parseHeroQuery } from './validation.js';

export const HEROI_USAGE_MESSAGE =
  '⚠️ Argumentos inválidos. Uso correto: /heroi <nome> (até 40 caracteres, sem caracteres de controle).';

export function createHeroiCommand(provider: MLBBProvider): CommandDefinition {
  return {
    name: 'heroi',
    description: 'Consulta informações de um herói. Uso: /heroi <nome>',
    usage: HEROI_USAGE_MESSAGE,
    input: heroQueryArgsSchema,
    async handle(_context, args) {
      const query = parseHeroQuery(args);
      if (!query) {
        return HEROI_USAGE_MESSAGE;
      }

      try {
        const found = await provider.findHero(query);
        if (!found.data) {
          throw new MLBBProviderError(
            'NOT_FOUND',
            `Hero not found: ${query}`,
            '🔍 Herói não encontrado. Verifique o nome ou ID informado.'
          );
        }

        const detail = await provider.getHero(found.data.hero_id);
        return formatHeroInfo(detail, {
          stale: found.metadata.stale || detail.metadata.stale,
        });
      } catch (error) {
        return formatProviderError(error);
      }
    },
  };
}
