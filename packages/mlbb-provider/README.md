# @aerobot/mlbb-provider

Heroes/meta only: `MLBBProvider.listHeroes()` and `findHero(nameOrId)`. No player login, WR, KDA, profile or match history support. Every result, including an unsuccessful lookup, carries `{ source, collectedAt, reliability: 'unverified', stale }` metadata.

**Not verified against the real service.** Endpoints and response shapes are assumptions, not an integration guarantee. Default URL: `https://arena.rone.dev/api/heroes`; configure `heroesPath` when verified. Synthetic tests use an injected fake HTTP client and never call the network.

```ts
import { ArenaProvider, ATTRIBUTION } from '@aerobot/mlbb-provider';
const provider = new ArenaProvider({ ttlMs: 3_600_000, minIntervalMs: 1000, timeoutMs: 10_000 });
const heroes = await provider.listHeroes();
console.log(ATTRIBUTION, heroes.metadata);
```

Mandatory attribution (exported as `ATTRIBUTION`): **Hero/meta data: Rone Arena (https://arena.rone.dev). Mobile Legends: Bang Bang and game assets: Moonton. Unofficial integration.** Consumers must display this attribution with data/reports. Attribution is not a license grant; terms and permission remain to be checked before production use.

Tolerant Zod schema accepts an array, `{ heroes: [...] }`, `{ data: [...] }`, or `{ data: { heroes: [...] } }`. A hero requires a string/number ID and nonempty name; optional meta is a record, and unknown hero fields are retained. Unknown envelopes and malformed heroes fail validation; partial datasets are not silently accepted. Name matching is case-insensitive exact matching; ID matching is exact.

Disk cache defaults to `~/.aerobot/cache/arena-heroes.json`; configurable `cachePath`. TTL defaults to one hour. Writes use a temporary sibling and rename. Cache is validated on read; corrupt/missing cache is a miss. Expired cache is returned with stale=true on 503 High traffic, timeout, transport or validation failure, preserving original collection time. With no cache, a 503 `alternative_endpoint` is tried once, restricted to the same HTTPS origin; redirects are rejected by the default HTTP client. Cached data takes precedence over the alternative. Without usable cache, failures propagate. There is no maximum stale age: consumers must inspect collectedAt/stale.

Requests are serialized and start at least minIntervalMs apart per provider instance (including alternative requests). Use one instance per process; this is not a distributed limiter or a published service quota. Timeout also bounds injected clients that ignore abort. Inject `client`, `now` and `sleep` for deterministic offline testing. No automatic background requests.
