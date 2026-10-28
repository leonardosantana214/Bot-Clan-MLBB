import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBot,
  FakeWhatsAppAdapter,
  InMemoryAuditLog,
  InMemoryGroupRouteRegistry,
  InMemoryMemberRepository,
  InMemoryXpLedger,
  type CommandContext,
  type CommandDefinition,
} from '@aerobot/core';
import { ArenaProvider, SHORT_ATTRIBUTION, type HttpClient } from '@aerobot/mlbb-provider';
import { META_USAGE_MESSAGE, createMlbbCommands, parseHeroQuery } from '../src/index.js';

// Real responses captured from the Rone Arena service on 2026-10-28 (shared with the provider tests).
const fixtureUrl = (name: string) =>
  fileURLToPath(new URL(`../../mlbb-provider/tests/fixtures/${name}`, import.meta.url));
const loadFixture = async (name: string): Promise<any> => JSON.parse(await readFile(fixtureUrl(name), 'utf8'));

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true })));
});

/** ArenaProvider wired to a fake HTTP client that serves the real fixtures; no network is ever used. */
async function setup(overrides?: (url: string) => { status: number; body: unknown } | undefined) {
  const [heroes, detail, rank, counters] = await Promise.all([
    loadFixture('rone-heroes.json'),
    loadFixture('rone-detail.json'),
    loadFixture('rone-rank.json'),
    loadFixture('rone-counters.json'),
  ]);
  // The captured hero list has 3 heroes; add Miya (id 1) so name lookups can resolve her.
  heroes.data.records.push({ data: { hero: { data: { name: 'Miya' } }, hero_id: 1, relation: {} } });
  // Counters only carry hero ids; the first counter in the fixture is id 3, resolved through this list.
  heroes.data.records.push({ data: { hero: { data: { name: 'Saber' } }, hero_id: 3, relation: {} } });

  const requested: string[] = [];
  const client: HttpClient = {
    get: async url => {
      requested.push(url);
      const custom = overrides?.(url);
      if (custom) return custom;
      if (url.includes('/api/heroes/rank')) return { status: 200, body: rank };
      if (url.includes('/counters')) return { status: 200, body: counters };
      if (/\/api\/heroes\/\d+/.test(url)) return { status: 200, body: detail };
      return { status: 200, body: heroes };
    },
  };
  const folder = await mkdtemp(join(tmpdir(), 'aerobot-cmds-'));
  folders.push(folder);
  const provider = new ArenaProvider({ client, cachePath: join(folder, 'cache.json'), minIntervalMs: 0 });
  const commands = createMlbbCommands(provider);
  const get = (name: string): CommandDefinition => {
    const found = commands.find(command => command.name === name);
    if (!found) throw new Error(`missing command ${name}`);
    return found;
  };
  const run = (name: string, args: string[]) => get(name).handle({} as CommandContext, args);
  return { commands, requested, run };
}

describe('createMlbbCommands', () => {
  it('exposes plain, unique command names', async () => {
    const { commands } = await setup();
    expect(commands.map(c => c.name)).toEqual(['heroi', 'meta', 'counter']);
  });

  it('/heroi returns hero info with attribution', async () => {
    const { run } = await setup();
    const text = await run('heroi', ['Miya']);
    expect(text).toContain('*Miya*');
    expect(text).toContain(SHORT_ATTRIBUTION);
    expect(text).not.toContain('wsrv.nl');
  });

  it('/heroi joins multi-word names and is case-insensitive', async () => {
    const { run, requested } = await setup();
    const text = await run('heroi', ['mIyA']);
    expect(text).toContain('*Miya*');
    expect(requested.some(url => url.includes('/api/heroes/1'))).toBe(true);
  });

  it('/heroi answers friendly when the hero does not exist', async () => {
    const { run } = await setup();
    expect(await run('heroi', ['Inexistente'])).toContain('não encontrado');
  });

  it('/meta defaults to 7 days and all ranks and lists the top heroes', async () => {
    const { run, requested } = await setup();
    const text = await run('meta', []);
    expect(text).toContain('Masha');
    expect(text).toContain('61,4%');
    expect(requested.find(url => url.includes('/rank'))).toMatch(/days=7.*rank=all|rank=all.*days=7/);
  });

  it('/meta accepts days and rank filters (rank case-insensitive)', async () => {
    const { run, requested } = await setup();
    await run('meta', ['3', 'MYTHIC']);
    const url = requested.find(u => u.includes('/rank')) ?? '';
    expect(url).toContain('days=3');
    expect(url).toContain('rank=mythic');
  });

  it.each([[['99']], [['7', 'bronze']], [['abc']], [['1', 'all', 'extra']]])(
    '/meta rejects invalid args %j without calling the service',
    async args => {
      const { run, requested } = await setup();
      expect(await run('meta', args)).toBe(META_USAGE_MESSAGE);
      expect(requested).toHaveLength(0);
    }
  );

  it('/counter returns the best counters', async () => {
    const { run } = await setup();
    const text = await run('counter', ['Miya']);
    expect(text).toContain('Melhores Counters');
    expect(text).toContain('Miya');
    expect(text).toContain(SHORT_ATTRIBUTION);
  });

  it('/counter resolves counter names from the hero list instead of showing raw ids', async () => {
    const { run } = await setup();
    const text = await run('counter', ['1']);
    expect(text).toContain('1. *Saber*');
    expect(text).not.toContain('Herói #3 ');
  });

  it('/meta 503 gives the high-traffic message', async () => {
    const { run } = await setup(() => ({ status: 503, body: { code: 503, message: 'High traffic' } }));
    expect(await run('meta', [])).toContain('alto tráfego');
  });

  it('turns service failures into a friendly message without leaking internals', async () => {
    const { run } = await setup(() => ({ status: 503, body: { code: 503, message: 'High traffic' } }));
    for (const [name, args] of [['meta', []], ['counter', ['Miya']], ['heroi', ['Miya']]] as const) {
      const text = await run(name, [...args]);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/arena\.rone\.dev|https?:\/\/|\bat \w+.*\(|Error:/);
    }
  });

  it('rejects over-long or control-character input', () => {
    expect(parseHeroQuery(['a'.repeat(41)])).toBeUndefined();
    expect(parseHeroQuery(['Mi\u0000ya'])).toBeUndefined();
    expect(parseHeroQuery(['‮evil'])).toBeUndefined();
    expect(parseHeroQuery(['Chang\'e'])).toBe("Chang'e");
    expect(parseHeroQuery(['Yi', 'Sun-shin'])).toBe('Yi Sun-shin');
  });

  it('never sends a request when the hero query is invalid', async () => {
    const { run, requested } = await setup();
    expect(await run('heroi', ['x'.repeat(50)])).toContain('Argumentos inválidos');
    expect(await run('counter', ['x'.repeat(50)])).toContain('Argumentos inválidos');
    expect(requested).toHaveLength(0);
  });
});

describe('integration with the core bot', () => {
  it('answers /meta 7 mythic in an allowed group through createBot(extraCommands)', async () => {
    const { commands } = await setup();
    const adapter = new FakeWhatsAppAdapter();
    const bot = createBot({
      members: new InMemoryMemberRepository(),
      ledger: new InMemoryXpLedger(),
      audit: new InMemoryAuditLog(),
      adapter,
      clock: { now: () => Date.UTC(2026, 9, 28) },
      routes: new InMemoryGroupRouteRegistry([
        { platformGroupId: 'synthetic-group', allowedCommands: ['heroi', 'meta', 'counter'] },
        { platformGroupId: 'blocked-group', allowedCommands: ['ping'] },
      ]),
      extraCommands: commands,
    });
    await bot.receive({ id: '1', senderId: 'u1', groupId: 'synthetic-group', text: '/meta 7 mythic', fromMe: false });
    await bot.receive({ id: '2', senderId: 'u2', groupId: 'blocked-group', text: '/meta', fromMe: false });
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]?.groupId).toBe('synthetic-group');
    expect(adapter.sent[0]?.text).toContain('Masha');
  });
});
