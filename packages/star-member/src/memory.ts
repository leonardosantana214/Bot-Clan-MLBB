import { assertAppendOnly } from './invariants.js';
import type { StarRepository, StarState } from './model.js';
export class InMemoryStarRepository implements StarRepository {
  private state: StarState = { entries: [], snapshots: [], raffles: [] };
  read(): StarState { return structuredClone(this.state); }
  transaction<T>(work: (state: StarState) => T): T {
    const next = this.read();
    const result = work(next);
    assertAppendOnly(this.state, next);
    this.state = structuredClone(next);
    return structuredClone(result);
  }
}
