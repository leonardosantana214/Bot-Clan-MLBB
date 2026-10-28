import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { InMemoryMemberRepository, createBot, FakeWhatsAppAdapter, InMemoryGroupRouteRegistry, InMemoryXpLedger, InMemoryAuditLog } from '@aerobot/core';
import type { Member } from '@aerobot/core';
import { StarMember, InMemoryStarRepository, SqliteStarRepository, defaultConfig, periodAt, verifyRaffle, createStarCommands } from '../src/index.js';
import type { StarRepository, ScoreInput } from '../src/index.js';

const member = (id: string, status: Member['status'] = 'active'): Member => ({ id, name: 'Pessoa ' + id, status, registeredAt: 0, identities: [{ platformUserId: id + '@whatsapp.test' }] });
async function setup(repository: StarRepository) {
  const members = new InMemoryMemberRepository();
  for (const id of ['a', 'b', 'c']) await members.register(member(id));
  for (const status of ['pending', 'left', 'suspended', 'deleted'] as const) await members.register(member(status, status));
  let now = Date.parse('2026-01-15T12:00:00Z');
  const clock = { now: () => now };
  const service = new StarMember({ repository, members, clock, randomBytes: size => new Uint8Array(size).fill(7) });
  const score = (id: string, points: number, category: ScoreInput['category'] = 'atividade') => service.score({ memberId: id, category, points, reason: 'Teste sintético' }, 'adm');
  const fifty = async (id: string) => { await score(id, 30); await score(id, 20, 'partidas'); };
  return { service, members, clock, score, fifty, setDate: (date: string) => { now = Date.parse(date); } };
}
for (const backend of ['memory', 'sqlite'] as const) describe('contrato ' + backend, () => {
  async function fixture() {
    const db = backend === 'sqlite' ? new DatabaseSync(':memory:') : undefined;
    const repository = db ? new SqliteStarRepository(db) : new InMemoryStarRepository();
    return { ...await setup(repository), repository, db };
  }
  it('valida soma, limites, compensações e elegibilidade 49/50', async () => {
    const f = await fixture();
    await f.score('a', 30); await f.score('a', 19, 'partidas');
    expect((await f.service.own('a')).eligible).toBe(false);
    await f.score('a', 1, 'partidas');
    expect((await f.service.own('a')).eligible).toBe(true);
    await expect(f.score('a', 1)).rejects.toThrow('Limite');
    await f.score('a', -5);
    expect((await f.service.own('a')).standing?.total).toBe(45);
    await expect(f.score('a', -26)).rejects.toThrow('Limite');
    await expect(f.score('a', 0.5)).rejects.toThrow('inteiros');
    await expect(f.service.score({ memberId: 'a', category: 'rising', points: 1, reason: ' ' }, 'adm')).rejects.toThrow();
    for (const id of ['pending', 'left', 'suspended', 'deleted']) await expect(f.score(id, 1)).rejects.toThrow('habilitado');
    f.db?.close();
  });
  it('mantém empate pendente, sugestão e decisão auditada; revisa sem alterar versões', async () => {
    const f = await fixture();
    await f.fifty('a'); await f.score('b', 25, 'rising'); await f.score('b', 20, 'partidas'); await f.score('b', 5, 'fairplay');
    const first = await f.service.close('adm');
    expect(first.merit.status).toBe('empate pendente');
    expect(first.merit.candidates).toEqual(['a', 'b']);
    await expect(f.score('a', -1)).rejects.toThrow('fechado');
    await expect(f.service.close('adm')).rejects.toThrow('fechado');
    expect(() => f.service.resolveTie('c', 'adm', 'Decisão')).toThrow('empate');
    const second = f.service.resolveTie('b', 'adm', 'Decisão manual');
    expect(second.merit.winner).toBe('b');
    expect(second.tieDecision?.reason).toBe('Decisão manual');
    const third = await f.service.revise('2026-01', [{ memberId: 'a', category: 'atividade', points: -1, reason: 'Correção' }], 'adm2', 'Recurso aceito', 'Contestação sintética');
    expect(third.version).toBe(3); expect(third.revision?.actor).toBe('adm2');
    expect(third.standings.find(r => r.memberId === 'a')?.total).toBe(49);
    expect(f.repository.read().snapshots[0]).toEqual(first);
    const detached = f.repository.read(); detached.snapshots[0]!.eligible.length = 0;
    expect(f.repository.read().snapshots[0]).toEqual(first);
    f.db?.close();
  });
  it('sorteio uniforme por pessoa, verificável, aprovado e exclui vencedor anterior', async () => {
    const f = await fixture();
    await f.fifty('a'); await f.fifty('b');
    await f.service.close('adm');
    const result = await f.service.raffle('adm');
    expect(result.candidates).toEqual(['a', 'b']);
    expect(verifyRaffle(result)).toBe(true);
    expect(verifyRaffle({ ...result, winner: 'intruso' })).toBe(false);
    expect(verifyRaffle({ ...result, candidates: ['a', 'a', 'b'] })).toBe(false);
    expect(verifyRaffle({ ...result, seed: 'inválido' })).toBe(false);
    expect(verifyRaffle({ ...result, seed: 'aa'.repeat(32) })).toBe(false);
    expect(verifyRaffle({ ...result, snapshotVersion: 999 })).toBe(false);
    expect(result.status).toBe('pendente de aprovação');
    expect(f.repository.read().raffles[0]?.approval).toBeUndefined();
    expect(f.service.approve('adm2').status).toBe('publicado');
    expect(() => f.service.approve('adm2')).toThrow('pendente');
    await expect(f.service.raffle('adm')).rejects.toThrow('registrado');
    f.setDate('2026-02-15T12:00:00Z');
    await f.fifty('a'); await f.fifty('b'); await f.service.close('adm');
    const next = await f.service.raffle('adm');
    expect(next.candidates).toHaveLength(1);
    expect(next.winner).not.toBe(result.winner);
    expect(next.excludedPreviousWinner).toBe(result.winner);
    expect(verifyRaffle(next)).toBe(true);
    f.db?.close();
  });
  it('falha sem elegíveis e quando exclusão deixa zero', async () => {
    const f = await fixture();
    await f.service.close('adm');
    await expect(f.service.raffle('adm')).rejects.toThrow('Nenhum elegível');
    f.setDate('2026-02-15T12:00:00Z');
    await f.fifty('a'); await f.service.close('adm'); await f.service.raffle('adm'); f.service.approve('adm');
    f.setDate('2026-03-15T12:00:00Z');
    await f.fifty('a'); await f.service.close('adm');
    await expect(f.service.raffle('adm')).rejects.toThrow('Nenhum elegível');
    f.db?.close();
  });
  it('revisão preserva extração anterior e requer novo sorteio antes de aprovar', async () => {
    const f = await fixture();
    await f.fifty('a'); await f.service.close('adm');
    const original = await f.service.raffle('adm');
    const revised = await f.service.revise('2026-01', [{ memberId: 'a', category: 'partidas', points: -1, reason: 'Correção' }], 'adm', 'Revisão', 'Recurso');
    expect(revised.eligible).toEqual([]);
    expect(() => f.service.approve('adm')).toThrow('pendente');
    await expect(f.service.raffle('adm')).rejects.toThrow('Nenhum elegível');
    const restored = await f.service.revise('2026-01', [{ memberId: 'a', category: 'partidas', points: 1, reason: 'Reposição' }], 'adm', 'Recurso confirmado', 'Contestação');
    expect(restored.standings.find(r => r.memberId === 'a')?.total).toBe(50);
    const next = await f.service.raffle('adm');
    expect(next.snapshotVersion).toBe(3);
    expect(f.service.approve('adm').status).toBe('publicado');
    expect(f.repository.read().raffles[0]).toEqual(original);
    f.db?.close();
  });
  it('permite desativar exclusão e configura limiar sem alterar pesos padrão', async () => {
    const f = await fixture();
    const service = new StarMember({ repository: f.repository, members: f.members, clock: f.clock, config: { ...defaultConfig, threshold: 49, excludePreviousWinner: false }, randomBytes: size => new Uint8Array(size) });
    for (const period of ['2026-01', '2026-02']) {
      await service.score({ memberId: 'a', category: 'atividade', points: 30, reason: 'Teste' }, 'adm', period);
      await service.score({ memberId: 'a', category: 'partidas', points: 19, reason: 'Teste' }, 'adm', period);
      await service.close('adm', period);
      expect((await service.raffle('adm', period)).winner).toBe('a');
      service.approve('adm', 'Aprovado', period);
    }
    expect(defaultConfig.threshold).toBe(50);
    f.db?.close();
  });
  it('rollback atômico, snapshots e ledger append-only', async () => {
    const f = await fixture(); await f.fifty('a'); await f.service.close('adm');
    const before = f.repository.read();
    expect(() => f.repository.transaction(state => { state.entries.length = 0; throw new Error('rollback'); })).toThrow();
    expect(f.repository.read()).toEqual(before);
    if (f.db) {
      for (const table of ['star_entries', 'star_snapshots']) for (const sql of ['UPDATE ' + table + ' SET payload = payload', 'DELETE FROM ' + table]) expect(() => f.db!.exec(sql)).toThrow('Append-only');
      expect(f.db.prepare('SELECT version FROM star_schema_version').get()?.version).toBe(1);
      expect(new SqliteStarRepository(f.db).read()).toEqual(before);
    }
    f.db?.close();
  });
});
it('valida pesos e mês civil São Paulo inclusive virada de ano', () => {
  expect(periodAt(Date.parse('2026-02-01T02:59:59Z'))).toBe('2026-01');
  expect(periodAt(Date.parse('2026-02-01T03:00:00Z'))).toBe('2026-02');
  expect(periodAt(Date.parse('2027-01-01T02:00:00Z'))).toBe('2026-12');
  expect(() => new StarMember({ repository: new InMemoryStarRepository(), members: new InMemoryMemberRepository(), clock: { now: () => 0 }, config: { ...defaultConfig, weights: { ...defaultConfig.weights, atividade: 31 } } })).toThrow();
});
it('comandos extraCommands, autorização por rota e privacidade', async () => {
  const f = await setup(new InMemoryStarRepository());
  const commands = createStarCommands(f.service);
  const adapter = new FakeWhatsAppAdapter();
  const bot = createBot({ adapter, members: f.members, ledger: new InMemoryXpLedger(), clock: f.clock, audit: new InMemoryAuditLog(), commandIntervalMs: 0,
    routes: new InMemoryGroupRouteRegistry([{ platformGroupId: 'chat', allowedCommands: commands.memberCommands.map(c => c.name) }, { platformGroupId: 'adm', allowedCommands: commands.adminCommands.map(c => c.name) }]),
    extraCommands: [...commands.memberCommands, ...commands.adminCommands] });
  let sequence = 0;
  const send = (text: string, groupId = 'chat', senderId = 'a@whatsapp.test') => bot.receive({ id: String(sequence++), text, groupId, senderId, fromMe: false });
  await send('/pontuar b atividade 30 Teste'); expect((await f.service.own('b')).standing?.total).toBe(0);
  await send('/pontuar b atividade 30 Teste', 'adm');
  await send('/estrela'); expect(adapter.sent.at(-1)?.text).toContain('Total: 0');
  await send('/pontuar a atividade 30 Teste', 'adm'); await send('/pontuar a partidas 20 Teste', 'adm');
  await send('/fecharestrela', 'adm'); await send('/sortearestrela', 'adm');
  f.setDate('2026-02-15T12:00:00Z'); await send('/historicoestrela');
  expect(adapter.sent.at(-1)?.text).not.toContain('sorteio:');
  f.service.approve('adm', 'Aprovado', '2026-01');
  await send('/historicoestrela'); expect(adapter.sent.at(-1)?.text).toContain('sorteio: Pessoa a');
  expect(adapter.sent.map(m => m.text).join(' ')).not.toContain('@whatsapp');
  expect(JSON.stringify(f.service.publicRanking('2026-01'))).not.toContain('memberId');
  await send('/estrela', 'chat', 'left@whatsapp.test'); expect(adapter.sent.at(-1)?.text).toBe('Cadastro não habilitado.');
  await send('/pontuar a rising 1', 'adm'); expect(adapter.sent.at(-1)?.text).toContain('Argumentos inválidos');
});
