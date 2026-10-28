# Progression and persona

**Proposta / pendente de aprovação pela liderança AERO.**

The proposed default threshold is `ceil(200 * level ** 2.5)` total XP.
Level zero starts at zero. Levels remain a deterministic function of signed total XP.
At the default daily cap of 100 XP (10 distinct messages, at least 60 seconds apart):

| Level | Total XP | Days at cap (rounded up) |
| --- | ---: | ---: |
| 1 | 200 | 2 |
| 2 | 1,132 | 12 |
| 3 | 3,118 | 32 |
| 5 | 11,181 | 112 |
| 10 | 63,246 | 633 |
| 15 | 174,285 | 1,743 |
| 20 | 357,771 | 3,578 |

These are cumulative active days, not days since registration. High levels require
many months or years. Manual credits/corrections can change these estimates.
Changing the formula recalculates current levels for existing balances; no XP is
rewritten, no historic crossings are backfilled, and no migration congratulations
are sent. Historic events retain the levels observed with the formula at that time.

## Host configuration

`run.ts` parses the following environment variables; `composeHost` also accepts
`xpPolicy`, `levelFormula`, and `persona` explicitly without process-global reads.
Invalid numeric settings fail startup. No external dependencies or LLM calls.

| Environment | Default |
| --- | --- |
| `AEROBOT_XP_ENABLED` | disabled; only exact `1` enables message XP |
| `AEROBOT_XP_AWARD` | `10` |
| `AEROBOT_XP_DAILY_CAP` | `100` |
| `AEROBOT_XP_MIN_INTERVAL_MS` | `60000` |
| `AEROBOT_LEVEL_BASE_XP` | `200` |
| `AEROBOT_LEVEL_EXPONENT` | `2.5` |
| `AEROBOT_PERSONA` | `neutro`; opt in with `conselheiro` |

The existing antiflood uses the Sao Paulo calendar, ignores commands and bot
messages, rejects duplicate IDs, and retains only fingerprints of repeated text.
Message fingerprints are in memory; XP deduplication and daily limits persist.

## Level history and notifications

Core exposes `LevelEvents.list(memberId | undefined, inclusiveStart, exclusiveEnd)`
and `InMemoryLevelEvents.wrap(ledger, formula)`. Community exposes
`SqliteLevelEvents(path, formula).wrap(ledger)`, using the existing XP database.
Always append via the wrapped ledger: the host installs it as `storage.ledger`,
so future Controller actions using that port participate without Controller changes.
Do not mix formulas or bypass the wrapper with direct SQL/another ledger writer.
SQLite records XP, derived balance, and history in one `BEGIN IMMEDIATE` transaction;
its dedicated `level_events` table rejects UPDATE and DELETE via triggers.
The memory wrapper serializes appends. Both return isolated history snapshots and
use transaction/source deduplication. Reads are ordered by occurrence (insertion
order breaks ties), and can filter one member or all members and a time period.

One append-only event aggregates all upward levels crossed by a transaction:
member, previous/new level, total XP, occurrence time, source transaction ID.
Negative corrections do not create downward events or notifications. A later gain
may cross a previously attained level again; it is a new crossing with a new source.
No event is inferred from a formula configuration change alone.

The host sends one short congratulations message to its configured CHAT group,
including a safe display name, new level, and XP remaining to the next threshold.
It never chooses ADM as a notification destination. Unsafe names fall back to
`integrante AERO`; no mention/JID is constructed. The same privacy guard applies
to registration confirmations, profiles, and rankings before persona formatting.
Profiles omit internal member IDs because legacy IDs can embed WhatsApp identities.

Notification delivery is **at most once per accepted source**, not guaranteed:
paused replies, unavailable transport, or a crash after commit can lose a message.
There is deliberately no replay/outbox, avoiding stale congratulations on resume.
History persists regardless of pause/delivery. Shutdown stops host callbacks.

## Deterministic royal persona

`Persona` adds one short framing sentence and preserves the safe payload verbatim.
`personaAdapter` is the single host output decorator shared by core commands,
community notifications, star-member commands, and maintenance/backup responses.
`royalPhrases` is the catalog: four variations for each of welcome, level up,
profile, XP, ranking, ping, usage error, unknown command, warning, backup, general.
The classifier selects a situation without rewriting names, numbers, commands,
references, or ranking order. An injected random function makes tests deterministic;
the previous variant per situation is excluded from consecutive selection.
Neutral output has no frame. Unknown commands now receive a short help hint only
in configured groups and under the existing command rate limit.

Persona does not sanitize payloads: privacy belongs to each message producer and
is identical for both styles. Additional custom commands must supply safe text.
Tests cover exact payload preservation, concise frames, non-repetition, privacy,
SQLite/memory parity, multi-level crossings, signed corrections, deduplication,
transaction rollback, restart persistence, paused replies, and CHAT routing.
