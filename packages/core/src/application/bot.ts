import type { CommandContext, CommandRegistry } from './command-registry.js';
import { InMemorySeenMessageStore } from './seen-messages.js';
import type { SeenMessageStore, IncomingMessage } from './ports.js';
import type { XpAntiflood } from './xp-antiflood.js';
export class Bot {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly commands: CommandRegistry, private readonly antiflood: XpAntiflood, private readonly context: Omit<CommandContext, 'message'>, private readonly seen: SeenMessageStore = new InMemorySeenMessageStore()) {}
  receive(message: IncomingMessage, beforeDispatch?: () => Promise<void>): Promise<void> {
    const work = this.queue.then(async () => {
      if (message.fromMe) return;
      if (!await this.seen.claim(message.groupId, message.id, this.context.clock.now())) return;
      try {
        await beforeDispatch?.();
        await this.commands.dispatch({ ...this.context, message });
        await this.antiflood.process(message);
        await this.seen.complete(message.groupId, message.id, this.context.clock.now());
      } catch (error) {
        await this.seen.release(message.groupId, message.id);
        throw error;
      }
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}
