import type { Member } from '../domain/models.js';
import type { MemberRepository, XpLedger } from './ports.js';

export type RankPeriod = 'semana' | 'mes' | 'geral';
export interface RankEntry { readonly member: Member; readonly xp: number; readonly position: number }
const dayMs = 86_400_000;
const localDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});
function calendarDay(at: number): number {
  const parts = localDate.formatToParts(at);
  const value = (type: string) => Number(parts.find(part => part.type === type)!.value);
  return Date.UTC(value('year'), value('month') - 1, value('day'));
}
// First instant of the local date, including historical midnight DST transitions.
function startOfDay(day: number): number {
  let low = day - dayMs;
  let high = day + dayMs;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (calendarDay(mid) < day) low = mid + 1;
    else high = mid;
  }
  return low;
}
export function rankPeriodBounds(period: RankPeriod, now: number): { start: number; end: number } {
  if (!Number.isFinite(now)) throw new Error('Invalid time');
  if (period === 'geral') return { start: -Infinity, end: Infinity };
  const day = calendarDay(now);
  const date = new Date(day);
  if (period === 'mes') return {
    start: startOfDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    end: startOfDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  };
  const monday = day - ((date.getUTCDay() + 6) % 7) * dayMs;
  return { start: startOfDay(monday), end: startOfDay(monday + 7 * dayMs) };
}

/** Sum ledger deltas in [start, end); never consult a cached balance. */
export async function rankByPeriod(members: MemberRepository, ledger: XpLedger, start = -Infinity, end = Infinity): Promise<readonly RankEntry[]> {
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) throw new Error('Invalid ranking interval');
  if (!members.list) throw new Error('Member enumeration unavailable');
  // Only current members are ranked: left, suspended, deleted and pending people must not appear publicly.
  const all = (await members.list()).filter(member => member.status === 'active' || member.status === 'inactive');
  const entries = ledger.listInRange
    ? await ledger.listInRange(start, end)
    : (await Promise.all(all.map(member => ledger.list(member.id)))).flat().filter(entry => entry.occurredAt >= start && entry.occurredAt < end);
  const totals = new Map<string, number>();
  for (const entry of entries) totals.set(entry.memberId, (totals.get(entry.memberId) ?? 0) + entry.amount);
  return all.map(member => ({ member, xp: totals.get(member.id) ?? 0 }))
    .sort((a, b) => b.xp - a.xp || a.member.registeredAt - b.member.registeredAt || (a.member.id < b.member.id ? -1 : a.member.id > b.member.id ? 1 : 0))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}
