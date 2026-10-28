import type { CommandContext, CommandRegistry } from './command-registry.js';
import { InMemorySeenMessageStore } from './seen-messages.js';
import type { SeenMessageStore, IncomingMessage } from './ports.js';
import type { XpAntiflood } from './xp-antiflood.js';
export class Bot {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly commands: CommandRegistry, private readonly antiflood: XpAntiflood, private readonly context: Omit<CommandContext, 'message'>, private readonly seen: SeenMessageStore = new InMemorySeenMessageStore()) {}
  receive(message: IncomingMessage): Promise<void> {
    const work = this.queue.then(async () => {
      if (message.fromMe) return;
      if (!await this.seen.claim(message.groupId, message.id, this.context.clock.now())) return;
      await this.commands.dispatch({ ...this.context, message });
      await this.antiflood.process(message);
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}
