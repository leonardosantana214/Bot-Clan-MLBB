import { z } from 'zod';
import type { LevelFormula } from '../domain/models.js';
import type { AuditLog, Clock, GroupRouteRegistry, IncomingMessage, MemberRepository, WhatsAppAdapter, XpLedger } from './ports.js';
export interface CommandContext {
  message: IncomingMessage; members: MemberRepository; ledger: XpLedger;
  clock: Clock; audit: AuditLog; levelFormula: LevelFormula;
}
export interface CommandDefinition {
  readonly name: string;
  readonly input: z.ZodType<readonly string[]>;
  handle(context: CommandContext, input: readonly string[]): Promise<string>;
}
export const noArguments = z.array(z.string()).length(0);
export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly lastCommand = new Map<string, number>();
  constructor(private readonly routes: GroupRouteRegistry, private readonly adapter: WhatsAppAdapter, private readonly intervalMs = 1000) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) throw new Error('Invalid rate limit');
  }
  register(command: CommandDefinition): void {
    if (this.commands.has(command.name)) throw new Error('Duplicate command');
    this.commands.set(command.name, command);
  }
  async dispatch(context: CommandContext): Promise<void> {
    const { message, clock } = context;
    const [token, ...args] = message.text.trim().split(/\s+/u);
    const name = token?.slice(1).toLowerCase();
    const command = name ? this.commands.get(name) : undefined;
    if (!token?.startsWith('/') || !command) return;
    const route = await this.routes.find(message.groupId);
    if (!route?.allowedCommands.includes(command.name)) return;
    const now = clock.now();
    const previous = this.lastCommand.get(message.senderId);
    if (previous !== undefined && now - previous < this.intervalMs) return;
    this.lastCommand.set(message.senderId, now);
    const parsed = command.input.safeParse(args);
    const response = parsed.success ? await command.handle(context, parsed.data) : 'Argumentos inválidos. Use /ajuda.';
    await this.adapter.sendMessage(message.groupId, response);
  }
}
