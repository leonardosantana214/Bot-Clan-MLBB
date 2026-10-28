export const categories = ['atividade', 'partidas', 'rising', 'comunidade', 'fairplay'] as const;
export type Category = typeof categories[number];
export type Points = Record<Category, number>;
export interface StarConfig { weights: Points; threshold: number; excludePreviousWinner: boolean }
export const defaultConfig: StarConfig = { weights: { atividade: 30, partidas: 20, rising: 25, comunidade: 15, fairplay: 10 }, threshold: 50, excludePreviousWinner: true };
export interface ScoreEntry {
  id: string; period: string; memberId: string; category: Category; points: number;
  reason: string; evidence?: string; actor: string; at: number;
}
export interface Standing { memberId: string; displayName: string; points: Points; total: number }
export interface Merit { status: 'decidido' | 'empate pendente' | 'sem participantes'; candidates: string[]; winner?: string }
export interface Decision { actor: string; reason: string; at: number }
export interface Snapshot {
  period: string; version: number; at: number; actor: string; config: StarConfig;
  standings: Standing[]; eligible: string[]; merit: Merit;
  revision?: Decision & { contestation: string; entries: ScoreEntry[] };
  tieDecision?: Decision;
}
export interface Raffle {
  period: string; snapshotVersion: number; seed: string; commitment: string; algorithm: 'sha256-rejection-v1';
  candidates: string[]; winner: string; excludedPreviousWinner?: string;
  actor: string; at: number; status: 'pendente de aprovação' | 'publicado'; approval?: Decision;
}
export interface StarState { entries: ScoreEntry[]; snapshots: Snapshot[]; raffles: Raffle[] }
/** Atomic synchronous unit of work. Throws roll back every change. */
export interface StarRepository {
  read(): StarState;
  transaction<T>(work: (state: StarState) => T): T;
}
export function periodAt(at: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(at);
  return parts.find(p => p.type === 'year')!.value + '-' + parts.find(p => p.type === 'month')!.value;
}
export function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return month === 1 ? String(year! - 1) + '-12' : String(year) + '-' + String(month! - 1).padStart(2, '0');
}
export function emptyPoints(): Points { return { atividade: 0, partidas: 0, rising: 0, comunidade: 0, fairplay: 0 }; }
export function latest(state: StarState, period: string): Snapshot | undefined { return state.snapshots.filter(s => s.period === period).at(-1); }
