import type { SeenMessageStore } from './ports.js';
/** Bounded LRU with a fixed retention age. IDs only, never message content. */
export class InMemorySeenMessageStore implements SeenMessageStore {
  private readonly ids = new Map<string, number>();
  constructor(private readonly limit = 10_000, private readonly maxAgeMs = 86_400_000) {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) throw new Error('Invalid retention');
  }
  async claim(groupId: string, messageId: string, at: number): Promise<boolean> {
    for (const [key, created] of this.ids) if (at - created >= this.maxAgeMs) this.ids.delete(key);
    const key = JSON.stringify([groupId, messageId]);
    const previous = this.ids.get(key);
    this.ids.delete(key);
    this.ids.set(key, previous ?? at);
    while (this.ids.size > this.limit) this.ids.delete(this.ids.keys().next().value!);
    return previous === undefined;
  }
}
