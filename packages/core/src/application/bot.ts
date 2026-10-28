import type { CommandContext, CommandRegistry } from './command-registry.js';
import type { IncomingMessage } from './ports.js';
import type { XpAntiflood } from './xp-antiflood.js';
export class Bot {
  private readonly seen = new Map<string, Set<string>>();
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly commands: CommandRegistry, private readonly antiflood: XpAntiflood, private readonly context: Omit<CommandContext, 'message'>) {}
  receive(message: IncomingMessage): Promise<void> {
    const work = this.queue.then(async () => {
      if (message.fromMe) return;
      const ids = this.seen.get(message.groupId) ?? new Set<string>();
      this.seen.set(message.groupId, ids);
      if (ids.has(message.id)) return;
      ids.add(message.id);
      await this.commands.dispatch({ ...this.context, message });
      await this.antiflood.process(message);
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}
