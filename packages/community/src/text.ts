import { createHash, randomUUID } from 'node:crypto';

export type IdGenerator = () => string;
export const defaultIdGenerator: IdGenerator = () => randomUUID();

/** Short, non-reversible reference used instead of raw WhatsApp identifiers in reports. */
export function shortHash(value: string, length = 8): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/gu;
const PHONE_LIKE = /\+?\d(?:[\s().-]?\d){6,}/gu;
const FORMATTING = /[*_~`@]/gu;

/** Makes user-controlled text safe for outgoing messages: no control chars, formatting, mentions or phone-like numbers. */
export function sanitizeText(value: string, max: number): string {
  const clean = value.replace(CONTROL, ' ').replace(PHONE_LIKE, '[número]').replace(FORMATTING, '').replace(/\s+/gu, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function formatDate(at: number): string { return new Date(at).toISOString().slice(0, 10); }

/** Insertion-ordered map with a hard size limit (oldest key evicted first). */
export class BoundedMap<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(key: K): V | undefined { return this.map.get(key); }
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) { const first = this.map.keys().next(); if (first.done) break; this.map.delete(first.value); }
  }
  delete(key: K): void { this.map.delete(key); }
  get size(): number { return this.map.size; }
}
