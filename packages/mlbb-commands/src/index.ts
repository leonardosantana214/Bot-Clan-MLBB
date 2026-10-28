import type { CommandDefinition } from '@aerobot/core';
import type { MLBBProvider } from '@aerobot/mlbb-provider';
import { HEROI_USAGE_MESSAGE, createHeroiCommand } from './heroi.js';
import {
  META_DEFAULT_DAYS,
  META_DEFAULT_RANK,
  META_TOP_N,
  META_USAGE_MESSAGE,
  createMetaCommand,
  metaArgsSchema,
} from './meta.js';
import {
  COUNTER_TOP_N,
  COUNTER_USAGE_MESSAGE,
  createCounterCommand,
} from './counter.js';
import {
  MAX_USER_INPUT_LENGTH,
  hasControlChars,
  heroQueryArgsSchema,
  parseHeroQuery,
  safeTokenSchema,
} from './validation.js';

export {
  HEROI_USAGE_MESSAGE,
  createHeroiCommand,
  META_DEFAULT_DAYS,
  META_DEFAULT_RANK,
  META_TOP_N,
  META_USAGE_MESSAGE,
  createMetaCommand,
  metaArgsSchema,
  COUNTER_TOP_N,
  COUNTER_USAGE_MESSAGE,
  createCounterCommand,
  MAX_USER_INPUT_LENGTH,
  hasControlChars,
  heroQueryArgsSchema,
  parseHeroQuery,
  safeTokenSchema,
};

export function createMlbbCommands(provider: MLBBProvider): CommandDefinition[] {
  return [
    createHeroiCommand(provider),
    createMetaCommand(provider),
    createCounterCommand(provider),
  ];
}
