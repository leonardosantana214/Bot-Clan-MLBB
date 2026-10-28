import { createHash } from 'node:crypto';
import type { Raffle } from './model.js';
/** Hash UTF-8 hex seed + colon + decimal counter; first unsigned 32 bits, big endian. */
export function draw(seed: string, candidates: readonly string[]): string {
  if (!/^[a-f0-9]{64}$/.test(seed) || !candidates.length || candidates.length > 0xffffffff) throw new Error('Seed ou lista inválida.');
  const limit = Math.floor(0x100000000 / candidates.length) * candidates.length;
  for (let counter = 0; ; counter++) {
    const value = createHash('sha256').update(seed + ':' + counter).digest().readUInt32BE(0);
    if (value < limit) return candidates[value % candidates.length]!;
  }
}
export function raffleCommitment(result: Omit<Raffle, 'commitment'>): string {
  return createHash('sha256').update(JSON.stringify({
    period: result.period, snapshotVersion: result.snapshotVersion, seed: result.seed,
    algorithm: result.algorithm, candidates: result.candidates, winner: result.winner,
    excludedPreviousWinner: result.excludedPreviousWinner ?? null, actor: result.actor, at: result.at
  })).digest('hex');
}
export function verifyRaffle(result: Raffle): boolean {
  try {
    const ordered = [...new Set(result.candidates)].sort();
    return result.commitment === raffleCommitment(result) && result.algorithm === 'sha256-rejection-v1' && JSON.stringify(ordered) === JSON.stringify(result.candidates)
      && !result.candidates.includes(result.excludedPreviousWinner ?? '') && draw(result.seed, ordered) === result.winner;
  } catch { return false; }
}
