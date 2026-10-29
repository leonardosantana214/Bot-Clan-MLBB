import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Clock, Member, MemberRepository } from '@aerobot/core';
import { displayName } from '@aerobot/core';
import { categories, defaultConfig, emptyPoints, latest, periodAt, previousPeriod } from './model.js';
import type { Category, Decision, Merit, Raffle, ScoreEntry, Snapshot, StarConfig, StarRepository, StarState, Standing } from './model.js';
import { draw, raffleCommitment, verifyRaffle } from './raffle.js';

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const text = z.string().trim().min(1);
const configSchema = z.object({
  weights: z.object({ atividade: z.number().int().nonnegative(), partidas: z.number().int().nonnegative(), rising: z.number().int().nonnegative(), comunidade: z.number().int().nonnegative(), fairplay: z.number().int().nonnegative() }),
  threshold: z.number().int().min(0).max(100), excludePreviousWinner: z.boolean()
}).refine(c => Object.values(c.weights).reduce((a, b) => a + b, 0) === 100, 'Pesos devem somar 100.');
export interface ScoreInput { memberId: string; category: Category; points: number; reason: string; evidence?: string }
export interface StarDependencies {
  repository: StarRepository; members: MemberRepository; clock: Clock;
  config?: StarConfig; randomBytes?: (size: number) => Uint8Array;
}
const allowed = (member: Member) => member.status === 'active' || member.status === 'inactive';
function meritFor(rows: Standing[]): Merit {
  if (!rows.length) return { status: 'sem participantes', candidates: [] };
  const top = rows.filter(r => r.total === rows[0]!.total);
  // Category order is only a suggestion for administrators, never an automatic decision.
  top.sort((a, b) => b.points.atividade - a.points.atividade || b.points.rising - a.points.rising
    || b.points.fairplay - a.points.fairplay || b.points.partidas - a.points.partidas || a.memberId.localeCompare(b.memberId));
  const candidates = top.map(r => r.memberId);
  return candidates.length === 1 ? { status: 'decidido', candidates, winner: candidates[0]! } : { status: 'empate pendente', candidates };
}
export class StarMember {
  private readonly settings: StarConfig;
  get config(): StarConfig { return structuredClone(this.settings); }
  constructor(private readonly deps: StarDependencies) { this.settings = configSchema.parse(deps.config ?? defaultConfig); }
  currentPeriod(): string { return periodAt(this.deps.clock.now()); }
  private async members(): Promise<readonly Member[]> {
    if (!this.deps.members.list) throw new Error('Repositório deve permitir listar membros.');
    return this.deps.members.list();
  }
  private decision(actor: string, reason: string): Decision {
    return { actor: text.parse(actor), reason: text.parse(reason), at: this.deps.clock.now() };
  }
  private entry(period: string, input: ScoreInput, actor: string): ScoreEntry {
    periodSchema.parse(period);
    const category = z.enum(categories).parse(input.category);
    if (!Number.isSafeInteger(input.points) || input.points === 0) throw new Error('Pontos devem ser inteiros não nulos.');
    return { ...input, category, memberId: text.parse(input.memberId), reason: text.parse(input.reason), actor: text.parse(actor), period, id: randomUUID(), at: this.deps.clock.now() };
  }
  private rows(entries: readonly ScoreEntry[], members: readonly Member[], period: string, config = this.config): Standing[] {
    return members.filter(allowed).map(member => {
      const points = emptyPoints();
      for (const e of entries.filter(e => e.period === period && e.memberId === member.id)) {
        points[e.category] += e.points;
        if (points[e.category] < 0 || points[e.category] > config.weights[e.category]) throw new Error('Limite da categoria ' + e.category + ': 0 a ' + config.weights[e.category] + '.');
      }
      return { memberId: member.id, displayName: displayName(member.name), points, total: Object.values(points).reduce((a, b) => a + b, 0) };
    }).sort((a, b) => b.total - a.total || a.memberId.localeCompare(b.memberId));
  }
  async score(input: ScoreInput, actor: string, period = this.currentPeriod()): Promise<ScoreEntry> {
    const members = await this.members();
    if (!members.some(m => m.id === input.memberId && allowed(m))) throw new Error('Membro não habilitado.');
    const entry = this.entry(period, input, actor);
    return this.deps.repository.transaction(state => {
      if (latest(state, period)) throw new Error('Período fechado; registre uma revisão.');
      this.rows([...state.entries, entry], members, period);
      state.entries.push(entry);
      return entry;
    });
  }
  async own(memberId: string, period = this.currentPeriod()): Promise<{ standing?: Standing; eligible: boolean }> {
    const members = await this.members();
    const state = this.deps.repository.read();
    const snapshot = latest(state, period);
    const standing = (snapshot?.standings ?? this.rows(state.entries, members, period)).find(r => r.memberId === memberId);
    const pool = snapshot?.eligible ?? this.rows(state.entries, members, period).filter(r => r.total >= this.config.threshold).map(r => r.memberId);
    const eligible = this.candidates(state, members, period, pool, snapshot?.config ?? this.config).includes(memberId);
    return standing ? { standing: { ...standing, displayName: displayName(standing.displayName) }, eligible } : { eligible: false };
  }
  private candidates(state: StarState, members: readonly Member[], period: string, pool: readonly string[], config: StarConfig): string[] {
    const excluded = config.excludePreviousWinner ? [...state.raffles].reverse().find(r => r.period === previousPeriod(period))?.winner : undefined;
    return [...new Set(pool)].filter(id => id !== excluded && members.some(m => m.id === id && allowed(m))).sort();
  }
  async close(actor: string, period = this.currentPeriod()): Promise<Snapshot> {
    periodSchema.parse(period); text.parse(actor);
    const members = await this.members();
    return this.deps.repository.transaction(state => {
      if (latest(state, period)) throw new Error('Período já fechado.');
      const standings = this.rows(state.entries, members, period);
      const snapshot: Snapshot = { period, version: 1, at: this.deps.clock.now(), actor, config: structuredClone(this.config), standings,
        eligible: standings.filter(r => r.total >= this.config.threshold).map(r => r.memberId).sort(), merit: meritFor(standings) };
      state.snapshots.push(snapshot);
      return snapshot;
    });
  }
  async revise(period: string, inputs: readonly ScoreInput[], actor: string, reason: string, contestation: string): Promise<Snapshot> {
    const decision = this.decision(actor, reason); text.parse(contestation);
    const members = await this.members();
    const entries = inputs.map(input => this.entry(period, input, actor));
    if (!entries.length) throw new Error('Revisão exige lançamentos compensatórios.');
    return this.deps.repository.transaction(state => {
      const old = latest(state, period);
      if (!old) throw new Error('Período ainda aberto.');
      // Freeze the original roster and names; revision may not introduce new participants.
      if (entries.some(e => !old.standings.some(r => r.memberId === e.memberId))) throw new Error('Membro fora do snapshot.');
      const frozenMembers: Member[] = old.standings.map(r => ({ id: r.memberId, name: r.displayName, identities: [], registeredAt: 0, status: 'active' }));
      const all = [...state.entries, ...state.snapshots.filter(s => s.period === period).flatMap(s => s.revision?.entries ?? []), ...entries];
      const standings = this.rows(all, frozenMembers, period, old.config);
      const eligible = standings.filter(r => r.total >= old.config.threshold && members.some(m => m.id === r.memberId && allowed(m))).map(r => r.memberId).sort();
      const next: Snapshot = { period, version: old.version + 1, at: decision.at, actor, config: old.config, standings, eligible,
        merit: meritFor(standings), revision: { ...decision, contestation, entries } };
      state.snapshots.push(next);
      return next;
    });
  }
  resolveTie(memberId: string, actor: string, reason: string, period = this.currentPeriod()): Snapshot {
    const decision = this.decision(actor, reason);
    return this.deps.repository.transaction(state => {
      const old = latest(state, period);
      if (!old || old.merit.status !== 'empate pendente' || !old.merit.candidates.includes(memberId)) throw new Error('Membro não participa de empate pendente.');
      const next: Snapshot = { ...old, version: old.version + 1, at: decision.at, actor, merit: { ...old.merit, status: 'decidido', winner: memberId }, tieDecision: decision };
      // Revision entries belong only to the version that introduced them.
      delete next.revision;
      state.snapshots.push(next);
      return next;
    });
  }
  async raffle(actor: string, period = this.currentPeriod()): Promise<Raffle> {
    text.parse(actor);
    const members = await this.members();
    return this.deps.repository.transaction(state => {
      const snapshot = latest(state, period);
      if (!snapshot) throw new Error('Feche o período primeiro.');
      if (state.raffles.some(r => r.period === period && r.snapshotVersion === snapshot.version)) throw new Error('Sorteio já registrado neste período.');
      const previous = [...state.raffles].reverse().find(r => r.period === previousPeriod(period));
      const excluded = snapshot.config.excludePreviousWinner ? previous?.winner : undefined;
      const candidates = this.candidates(state, members, period, snapshot.eligible, snapshot.config);
      if (!candidates.length) throw new Error('Nenhum elegível após exclusão do vencedor anterior e membros não habilitados.');
      const bytes = (this.deps.randomBytes ?? randomBytes)(32);
      if (bytes.length !== 32) throw new Error('Gerador deve retornar 32 bytes.');
      const seed = Buffer.from(bytes).toString('hex');
      const transcript: Omit<Raffle, 'commitment'> = { period, snapshotVersion: snapshot.version, seed, algorithm: 'sha256-rejection-v1', candidates, winner: draw(seed, candidates), actor, at: this.deps.clock.now(), status: 'pendente de aprovação',
        ...(excluded ? { excludedPreviousWinner: excluded } : {}) };
      const result: Raffle = { ...transcript, commitment: raffleCommitment(transcript) };
      state.raffles.push(result);
      return result;
    });
  }
  approve(actor: string, reason = 'Aprovação administrativa', period = this.currentPeriod()): Raffle {
    const approval = this.decision(actor, reason);
    return this.deps.repository.transaction(state => {
      const version = latest(state, period)?.version;
      const index = state.raffles.findIndex(r => r.period === period && r.snapshotVersion === version);
      const old = state.raffles[index];
      if (!old || old.status !== 'pendente de aprovação' || !verifyRaffle(old)) throw new Error('Nenhum sorteio válido pendente.');
      const snapshot = state.snapshots.find(s => s.period === period && s.version === old.snapshotVersion);
      if (!snapshot || latest(state, period)?.version !== old.snapshotVersion) throw new Error('Snapshot revisado; sorteio anterior não pode ser publicado.');
      const result: Raffle = { ...old, status: 'publicado', approval };
      state.raffles[index] = result;
      return result;
    });
  }
  publicRanking(period = this.currentPeriod()): { displayName: string; total: number }[] {
    return latest(this.deps.repository.read(), period)?.standings.map(r => ({ displayName: displayName(r.displayName), total: r.total })) ?? [];
  }
  history(memberId: string): { period: string; total?: number; meritWinner?: string; raffleWinner?: string }[] {
    const state = this.deps.repository.read();
    return [...new Set(state.snapshots.map(s => s.period))].filter(p => p < this.currentPeriod()).sort().map(period => {
      const snapshot = latest(state, period)!;
      const own = snapshot.standings.find(r => r.memberId === memberId);
      const raffle = [...state.raffles].reverse().find(r => r.period === period && r.status === 'publicado');
      const name = (id: string | undefined) => { const value = snapshot.standings.find(r => r.memberId === id)?.displayName; return value === undefined ? undefined : displayName(value); };
      const meritWinner = name(snapshot.merit.winner);
      const raffleWinner = name(raffle?.winner);
      return { period, ...(own ? { total: own.total } : {}), ...(meritWinner ? { meritWinner } : {}), ...(raffleWinner ? { raffleWinner } : {}) };
    });
  }
}
