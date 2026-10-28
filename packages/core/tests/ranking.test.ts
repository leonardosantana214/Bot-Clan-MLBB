import { describe, expect, it } from 'vitest';
import { createBot, FakeWhatsAppAdapter, InMemoryAuditLog, InMemoryGroupRouteRegistry, InMemoryMemberRepository, InMemoryXpLedger, noArguments, rankByPeriod, rankPeriodBounds, type Member, type XpTransaction } from '../src/index.js';

const member = (id: string, registeredAt = 0): Member => ({ id, name: `Jogador ${id}`, registeredAt, status: 'active', identities: [{ platformUserId: `synthetic-${id}@example.invalid` }] });
const transaction = (id: string, memberId: string, amount: number, occurredAt: number): XpTransaction => ({ id, memberId, amount, occurredAt, source: 'manual', sourceId: id, actorId: 'synthetic-admin', reason: 'Synthetic fixture' });

describe('ranking calendar in America/Sao_Paulo', () => {
  it.each([
    ['semana', '2026-11-02T02:59:59.999Z', '2026-10-26T03:00:00Z', '2026-11-02T03:00:00Z'],
    ['semana', '2026-11-02T03:00:00Z', '2026-11-02T03:00:00Z', '2026-11-09T03:00:00Z'],
    ['mes', '2026-11-01T02:59:59.999Z', '2026-10-01T03:00:00Z', '2026-11-01T03:00:00Z'],
    ['mes', '2026-11-01T03:00:00Z', '2026-11-01T03:00:00Z', '2026-12-01T03:00:00Z'],
    ['mes', '2026-12-31T23:00:00Z', '2026-12-01T03:00:00Z', '2027-01-01T03:00:00Z'],
    ['mes', '2024-02-29T12:00:00Z', '2024-02-01T03:00:00Z', '2024-03-01T03:00:00Z'],
    ['semana', '2018-11-04T12:00:00Z', '2018-10-29T03:00:00Z', '2018-11-05T02:00:00Z']
  ] as const)('%s at %s', (period, now, start, end) => {
    expect(rankPeriodBounds(period, Date.parse(now))).toEqual({ start: Date.parse(start), end: Date.parse(end) });
  });
  it('does not roll the calendar day at UTC midnight', () => {
    expect(rankPeriodBounds('mes', Date.parse('2026-11-01T00:00:00Z'))).toEqual(rankPeriodBounds('mes', Date.parse('2026-10-31T23:00:00Z')));
  });
});

it('sums signed deltas, applies [start,end), and breaks ties by registration then ID', async () => {
  const members = new InMemoryMemberRepository();
  const ledger = new InMemoryXpLedger();
  for (const m of [member('z', 1), member('b'), member('a'), member('zero')]) await members.register(m);
  for (const id of ['z', 'a', 'b']) {
    await ledger.append(transaction(`${id}-award`, id, 15, 100));
    await ledger.append(transaction(`${id}-correction`, id, -5, 199));
  }
  await ledger.append(transaction('before', 'z', 999, 99));
  await ledger.append(transaction('end', 'z', 999, 200));
  expect((await rankByPeriod(members, ledger, 100, 200)).map(e => [e.member.id, e.xp, e.position])).toEqual([
    ['a', 10, 1], ['b', 10, 2], ['z', 10, 3], ['zero', 0, 4]
  ]);
  const legacyLedger = { append: ledger.append.bind(ledger), list: ledger.list.bind(ledger) };
  expect(await rankByPeriod(members, legacyLedger, 100, 200)).toEqual(await rankByPeriod(members, ledger, 100, 200));
  await expect(rankByPeriod(members, ledger, 1, 1)).rejects.toThrow();
});

it('never ranks left, suspended, deleted or pending members, even with XP', async () => {
  const members = new InMemoryMemberRepository();
  const ledger = new InMemoryXpLedger();
  const statuses = ['active', 'inactive', 'left', 'suspended', 'deleted', 'pending'] as const;
  for (const status of statuses) {
    await members.register({ ...member(status), status });
    await ledger.append(transaction(`${status}-xp`, status, 50, 100));
  }
  const ranked = await rankByPeriod(members, ledger, 0, 1000);
  expect(ranked.map(entry => entry.member.id).sort()).toEqual(['active', 'inactive']);
  expect(ranked.map(entry => entry.position)).toEqual([1, 2]);
});

it('handles no members and members with an empty ledger deterministically', async () => {
  const members = new InMemoryMemberRepository();
  const ledger = new InMemoryXpLedger();
  expect(await rankByPeriod(members, ledger)).toEqual([]);
  await members.register(member('b')); await members.register(member('a'));
  expect((await rankByPeriod(members, ledger)).map(e => [e.member.id, e.xp])).toEqual([['a', 0], ['b', 0]]);
});

it('responds clearly for empty rankings and legacy member repositories', async () => {
  const members = new InMemoryMemberRepository();
  const adapter = new FakeWhatsAppAdapter();
  const deps = { members, adapter, ledger: new InMemoryXpLedger(), audit: new InMemoryAuditLog(), clock: { now: () => 0 }, routes: new InMemoryGroupRouteRegistry([{ platformGroupId: 'g', allowedCommands: ['rank'] }]) };
  const message = { id: 'empty', groupId: 'g', senderId: 'synthetic-user', text: '/rank', fromMe: false };
  await createBot(deps).receive(message);
  expect(adapter.sent.at(-1)!.text).toBe('Ranking sem membros registrados.');
  const legacy = { findByIdentity: members.findByIdentity.bind(members), register: members.register.bind(members) };
  await createBot({ ...deps, members: legacy }).receive(message);
  expect(adapter.sent.at(-1)!.text).toBe('Ranking indisponível neste armazenamento.');
});

it('dispatches period rankings, top alias, own position, dynamic help and validates arguments', async () => {
  const members = new InMemoryMemberRepository();
  const ledger = new InMemoryXpLedger();
  const adapter = new FakeWhatsAppAdapter();
  const now = Date.parse('2026-11-03T12:00:00Z');
  for (let i = 1; i <= 12; i++) {
    const id = String(i).padStart(2, '0');
    await members.register(member(id));
    await ledger.append(transaction(id, id, (13 - i) * 1000, now));
  }
  await ledger.append(transaction('old', '12', 99_000, Date.parse('2026-10-01T03:00:00Z')));
  const bot = createBot({ members, ledger, adapter, clock: { now: () => now }, audit: new InMemoryAuditLog(), commandIntervalMs: 0,
    routes: new InMemoryGroupRouteRegistry([{ platformGroupId: 'g', allowedCommands: ['rank', 'top', 'ajuda', 'extra', 'legacy'] }]),
    extraCommands: [
      { name: 'extra', description: 'Comando sintético.', input: noArguments, async handle() { return 'ok'; } },
      { name: 'legacy', input: noArguments, async handle() { return 'ok'; } }
    ]
  });
  let sequence = 0;
  const send = async (text: string, senderId = 'synthetic-12@example.invalid') => {
    await bot.receive({ id: String(++sequence), groupId: 'g', senderId, text, fromMe: false });
    return adapter.sent.at(-1)!.text;
  };
  const weekly = await send('/rank');
  expect(weekly).toContain('1º · Jogador 01 · 12.000 XP');
  expect(weekly).toContain('Sua posição: 12º · Jogador 12 · 1.000 XP');
  expect(weekly).not.toContain('Jogador 11');
  expect(weekly).not.toContain('@example.invalid');
  expect(weekly.split('\n')).toHaveLength(12);
  expect(await send('/rank semana')).toBe(weekly);
  expect(await send('/rank mes')).toContain('Sua posição: 12º');
  const general = await send('/rank geral');
  expect(general).toContain('1º · Jogador 12 · 100.000 XP');
  expect(await send('/top')).toBe(general);
  expect(await send('/rank ano')).toContain('Argumentos inválidos');
  expect(await send('/top semana')).toContain('Argumentos inválidos');
  expect(await send('/rank', 'unregistered')).not.toContain('Sua posição');
  const help = await send('/ajuda');
  // /ajuda only advertises commands this group's route allows.
  for (const name of ['ajuda', 'rank', 'top', 'extra', 'legacy']) expect(help).toContain(`/${name} · `);
  for (const name of ['ping', 'registrar', 'perfil', 'xp']) expect(help).not.toContain(`/${name} · `);
  expect(help).toContain('/extra · Comando sintético.');
  expect(help).toContain('/legacy · Sem descrição.');
});
