import { afterEach, expect, it, vi } from 'vitest';
import { InboundQueue, withTimeout } from '../src/limits.js';

afterEach(() => { vi.useRealTimers(); });

it('drops oldest waiting input with an observable counter', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seen: number[] = [];
  const queue = new InboundQueue(2, () => {});
  queue.enqueue(() => gate);
  for (const n of [1, 2, 3]) queue.enqueue(async () => { seen.push(n); });
  expect(queue.dropped).toBe(1);
  release();
  await queue.idle();
  expect(seen).toEqual([2, 3]);
});

it('bounds shutdown, discards waiting work and rejects new input', async () => {
  vi.useFakeTimers();
  const queue = new InboundQueue(2, () => {});
  let release!: () => void;
  queue.enqueue(() => new Promise<void>(resolve => { release = resolve; }));
  const work = vi.fn(async () => {});
  queue.enqueue(work);
  const closing = queue.close(100);
  await vi.advanceTimersByTimeAsync(100);
  expect(await closing).toBe(false);
  expect(queue.dropped).toBe(1);
  queue.enqueue(work);
  release(); await queue.idle();
  expect(work).not.toHaveBeenCalled();
});

it('times out a never-resolving send and clears its timer', async () => {
  vi.useFakeTimers();
  const sending = withTimeout(new Promise<void>(() => {}), 30_000);
  const assertion = expect(sending).rejects.toThrow('Operation timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
