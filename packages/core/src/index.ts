export * from './domain/models.js';
export * from './application/ports.js';
export * from './application/command-registry.js';
export * from './application/xp-antiflood.js';
export * from './application/bot.js';
export * from './adapters/in-memory.js';
import { defaultLevelFormula, type LevelFormula } from './domain/models.js';
import { CommandRegistry } from './application/command-registry.js';
import type { SeenMessageStore, AuditLog, Clock, GroupRouteRegistry, MemberRepository, WhatsAppAdapter, XpLedger } from './application/ports.js';
import { XpAntiflood, type XpPolicy } from './application/xp-antiflood.js';
import { Bot } from './application/bot.js';
import { ping } from './application/commands/ping.js';
import { ajuda } from './application/commands/ajuda.js';
import { registrar } from './application/commands/registrar.js';
import { perfil } from './application/commands/perfil.js';
import { xp } from './application/commands/xp.js';
export interface BotDependencies {
  adapter: WhatsAppAdapter; members: MemberRepository; routes: GroupRouteRegistry;
  ledger: XpLedger; clock: Clock; audit: AuditLog;
  seenMessages?: SeenMessageStore;
  xpPolicy?: XpPolicy; levelFormula?: LevelFormula; commandIntervalMs?: number;
}
export function createBot(deps: BotDependencies): Bot {
  const registry = new CommandRegistry(deps.routes, deps.adapter, deps.commandIntervalMs);
  for (const command of [ping, ajuda, registrar, perfil, xp]) registry.register(command);
  return new Bot(registry, new XpAntiflood(deps.members, deps.ledger, deps.clock, deps.xpPolicy), { ...deps, levelFormula: deps.levelFormula ?? defaultLevelFormula }, deps.seenMessages);
}

export * from './application/seen-messages.js';
