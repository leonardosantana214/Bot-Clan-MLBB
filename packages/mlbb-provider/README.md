# @aerobot/mlbb-provider

Provedor de heróis, detalhes, meta (ranking) e counters de Mobile Legends: Bang Bang via Rone Arena (`https://arena.rone.dev`), além de formatadores puros em PT-BR prontos para WhatsApp. Sem suporte a login de jogador, histórico de partidas, KDA ou perfil individual.

**Validado em 2026-10-28 contra o serviço real; formato pode mudar.** Todas as respostas seguem o envelope `{ code: 0, message, data: { records: [{ data: ... }], total }, traceID }` (`lang=pt` por padrão; `Cache-Control: max-age=300`; latência típica 3–9 s). Respostas com `code != 0` ou sem a estrutura essencial são rejeitadas pelos schemas Zod (que usam `.passthrough()` para tolerar campos extras).

## Uso

```ts
import {
  ArenaProvider,
  ATTRIBUTION,
  formatHeroInfo,
  formatMeta,
  formatCounters,
  formatProviderError,
} from '@aerobot/mlbb-provider';

const provider = new ArenaProvider({
  ttlMs: 300_000,       // 300 s (padrão)
  minIntervalMs: 1_000, // 1 s entre requisições por instância
  timeoutMs: 20_000,    // 20 s (padrão >= 20 s)
});

const heroes = await provider.listHeroes();
const detail = await provider.getHero('Miya');
const meta = await provider.getMeta({ days: 7, rank: 'mythic', sortField: 'win_rate', size: 5 });
const counters = await provider.getCounters('Miya', { days: 7, rank: 'mythic', size: 5 });

console.log(formatHeroInfo(detail));
console.log(formatMeta(meta, { topN: 5, rank: 'mythic', days: 7 }));
console.log(formatCounters(counters, { topN: 5 }));
```

## Endpoints e Métodos

- `listHeroes({ size, index, order, lang })` → `GET /api/heroes`
- `getHero(idOrName, { lang })` → `GET /api/heroes/{id|nome}`
- `getMeta({ days, rank, sortField, sortOrder, size, index, lang })` → `GET /api/heroes/rank`
  - `days`: `1 | 3 | 7 | 15 | 30`
  - `rank`: `'all' | 'epic' | 'legend' | 'mythic' | 'honor' | 'glory'`
  - `sortField`: `'pick_rate' | 'ban_rate' | 'win_rate'`
- `getCounters(idOrName, { days, rank, size, index, lang })` → `GET /api/heroes/{id}/counters`
  - Resolve nomes ausentes em `sub_hero` cruzando `heroid` com a lista `/api/heroes` em cache.

Enums e parâmetros são validados antes de qualquer requisição de rede, e entradas de usuário na URL passam por `encodeURIComponent`.

## Formatação Pura (WhatsApp PT-BR)

O módulo `src/format.ts` é puro (sem rede):
- `formatHeroInfo`: resumo do herói, funções, rotas, habilidades e relações.
- `formatMeta`: top N heróis com porcentagens formatadas em PT-BR (ex.: `61,4%`).
- `formatCounters`: melhores counters com pontos percentuais em PT-BR (ex.: `+2,9 pp`).
- `sanitizeApiText`: remove tags HTML, URLs de imagem (`wsrv.nl`), caracteres de controle e `@mentions`, limitando o tamanho.
- `formatProviderError`: mensagens de erro amigáveis em PT-BR.
- Inclui aviso de dados em cache (`stale`) quando aplicável e rodapé curto de atribuição (`SHORT_ATTRIBUTION`).

## Atribuição

Atribuição obrigatória (`ATTRIBUTION` / `SHORT_ATTRIBUTION`):
**Hero/meta data: Rone Arena (https://arena.rone.dev). Mobile Legends: Bang Bang and game assets: Moonton. Unofficial integration.**

## Cache, Stale e Resiliência

O cache em disco padrão fica em `~/.aerobot/cache/arena-heroes.json` (configurável via `cachePath`), com TTL padrão de 300 s (`300_000` ms) e escrita atômica (arquivo temporário + `rename`). Em caso de `503 High traffic`, timeout ou falha de rede/validação após expiração do TTL, o cache anterior é retornado com `metadata.stale = true` preservando `collectedAt`. Sem cache disponível em um `503`, um `alternative_endpoint` da mesma origem HTTPS (`https://arena.rone.dev`) é tentado uma única vez.
