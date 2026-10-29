import type { SeenMessageStore } from './ports.js';
/** Bounded LRU with a fixed retention age. IDs only, never message content. */
export class InMemorySeenMessageStore implements SeenMessageStore {
  private readonly ids = new Map<string, number>();
  private readonly received = new Set<string>();
  constructor(private readonly limit = 10_000, private readonly maxAgeMs = 86_400_000) {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) throw new Error('Invalid retention');
  }
  async claim(groupId: string, messageId: string, at: number): Promise<boolean> {
    for (const [key, created] of this.ids) if (at - created >= this.maxAgeMs) this.ids.delete(key);
    const key = JSON.stringify([groupId, messageId]);
    if (this.received.has(key)) return false;
    const previous = this.ids.get(key);
    this.ids.delete(key);
    if (previous !== undefined) this.ids.set(key, previous);
    else this.received.add(key);
    while (this.ids.size > this.limit) this.ids.delete(this.ids.keys().next().value!);
    return previous === undefined;
  }
  async complete(groupId: string, messageId: string, at: number): Promise<void> {
    const key = JSON.stringify([groupId, messageId]);
    this.ids.set(key, at); this.received.delete(key);
    while (this.ids.size > this.limit) this.ids.delete(this.ids.keys().next().value!);
  }
  async release(groupId: string, messageId: string): Promise<void> { this.received.delete(JSON.stringify([groupId, messageId])); }
}
