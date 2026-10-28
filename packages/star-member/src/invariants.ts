import type { StarState } from './model.js';
export function assertAppendOnly(before: StarState, after: StarState): void {
  for (const key of ['entries', 'snapshots'] as const) {
    if (after[key].length < before[key].length || before[key].some((row, i) => JSON.stringify(row) !== JSON.stringify(after[key][i]))) throw new Error('Registro append-only.');
  }
  if (after.raffles.length < before.raffles.length) throw new Error('Sorteios imutáveis.');
  for (let i = 0; i < before.raffles.length; i++) {
    const old = before.raffles[i]!;
    const next = after.raffles[i]!;
    if (JSON.stringify(old) === JSON.stringify(next)) continue;
    const { approval, ...withoutApproval } = next;
    if (old.status !== 'pendente de aprovação' || next.status !== 'publicado' || !approval || JSON.stringify({ ...withoutApproval, status: old.status }) !== JSON.stringify(old)) throw new Error('Sorteio imutável.');
  }
  if (new Set(after.entries.map(e => e.id)).size !== after.entries.length) throw new Error('Lançamento duplicado.');
  if (new Set(after.snapshots.map(s => s.period + ':' + s.version)).size !== after.snapshots.length) throw new Error('Snapshot duplicado.');
  if (new Set(after.raffles.map(r => r.period + ':' + r.snapshotVersion)).size !== after.raffles.length) throw new Error('Sorteio duplicado.');
}
