/** Bounds waiting; underlying transports must be closed separately to interrupt I/O. */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Operation timed out')), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** One active job plus at most capacity waiting jobs. Oldest waiting job is discarded. */
export class InboundQueue {
  private jobs: (() => Promise<void>)[] = [];
  private running: Promise<void> | undefined;
  private stopped = false;
  dropped = 0;
  constructor(private readonly capacity: number, private readonly onError: () => void) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid queue capacity');
  }
  enqueue(work: () => Promise<void>): void {
    if (this.stopped) return;
    if (this.jobs.length >= this.capacity) { this.jobs.shift(); this.dropped++; }
    this.jobs.push(work);
    if (!this.running) {
      this.running = this.drain();
      void this.running.finally(() => { this.running = undefined; });
    }
  }
  private async drain(): Promise<void> {
    while (this.jobs.length) {
      try { await this.jobs.shift()!(); } catch { this.onError(); }
    }
  }
  async idle(): Promise<void> { await this.running; }
  async close(budgetMs: number): Promise<boolean> {
    this.stopped = true;
    try { await withTimeout(this.idle(), budgetMs); return true; }
    catch { this.dropped += this.jobs.length; this.jobs = []; return false; }
  }
}
