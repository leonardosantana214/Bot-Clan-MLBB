# @aerobot/whatsapp-baileys

Experimental adapter for the core `WhatsAppAdapter`. Uses
`@whiskeysockets/baileys` **exactly `7.0.0-rc14`**, an MIT-licensed **release
candidate**. [Upstream tagged manifest](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc14/package.json).
Baileys is unofficial, unsupported by Meta, and can break or lead to an account
ban. Use only an authorized, dedicated **TEST number**. No detection evasion,
recipient discovery, bulk sending, or unsolicited campaigns are implemented.

## Manual test host

Node 22, pnpm 9. From the repository root:

```powershell
pnpm install
pnpm build
$env:AEROBOT_TEST_GROUP = 'your-authorized-test-group@g.us'
# Optional; defaults to ~/.aerobot/whatsapp-session, outside the repository.
$env:AEROBOT_SESSION_DIR = 'C:\private-aerobot\whatsapp-session'
pnpm --filter @aerobot/whatsapp-baileys start
```

Use a private interactive terminal. Scan the QR from the test phone's Linked
Devices screen. For pairing by code, set `AEROBOT_PAIRING_PHONE` to the test
number with country code (digits only, no `+`) before starting, then enter the
displayed code in WhatsApp's link-by-phone-number flow. Existing registered
sessions reconnect without another pairing code. Clear the phone environment
variable after pairing. Never redirect/capture pairing output or share it.
Pairing callbacks carry secrets directly to the private terminal, never to logs.
The host refuses redirected stdout. QR and pairing-code paths are alternatives.

Only the configured test group reaches the Bot; its route enables the existing
`ping`, `ajuda`, `registrar`, `perfil`, `xp`, `rank` and `top` commands, plus the
MLBB hero commands `heroi`, `meta` and `counter` (these call the unofficial Rone
Arena service with a 5 minute cache; set `AEROBOT_DISABLE_MLBB=1` to turn them
off). Without a configured
group, the host receives no commands. SQLite lives alongside the session.
Set `AEROBOT_PAUSED=1` before startup for maintenance; library users can call
`setPaused(true)` dynamically. Pausing rejects queued/new replies; an already
submitted send cannot be recalled. Stop with Ctrl+C/SIGTERM to detach listeners,
cancel timers, reject queued replies, close the socket, finish pending Bot work,
and close SQLite. Disconnect preserves credentials; it does not log out.

## Contract and safety

`BaileysAdapter` implements the additive core `ObservableWhatsAppAdapter`;
the original send-only `WhatsAppAdapter` remains unchanged. `InboundMessage`
aliases core's existing `IncomingMessage`. Connection and membership types are
provider-independent. `onMessage`, `onMembershipChange`, and `onConnectionState`
return unsubscribe functions; connection subscriptions receive the current state.
Import `BaileysSocketFactory` from `@aerobot/whatsapp-baileys/baileys-socket`;
the default entry is network-free.

`SocketFactory` is the only socket creation boundary. Tests import no real
Baileys runtime, open no sessions, and use synthetic fake events and timers.
Messages use the platform message ID, group JID and participant JID (including
LIDs); no phone identity guessing. Only text in live `notify` group messages is
forwarded, including extended/ephemeral text. Own messages, history appends,
status/broadcasts, direct messages and non-text messages are ignored. Core's
seen-message store handles redelivery/deduplication. Participant `add`/`remove`
events become join/leave; promotions and pending requests are ignored.

Defaults: one reply at least every 1000 ms, at most 20 attempts per rolling
60000 ms, at most 50 pending replies, serialized sends. Failed attempts count
toward limits and are never automatically resent. Sends require an open
connection and a group destination. Disconnect drops pending replies. Configure
`minIntervalMs`, `maxPerWindow`, `windowMs`, and `maxQueue` for the test workload;
these limits are not permission for bulk messaging.

Reconnect delays default to 1, 2, 4, 8, 16 seconds (cap 30 seconds), with five
retries. Opening a connection resets the counter. Logout (401), forbidden/ban
(403), replacement (440), bad session (500), and device mismatch (411) only
report a terminal state and never reconnect automatically. An operator may
explicitly connect again after resolving the cause. Other failures retry up to
the limit; no protocol/detection workarounds are used.

Session files use Baileys multi-file auth in `AEROBOT_SESSION_DIR` or the default
home directory. Treat the **whole directory as a secret**: keep it outside Git,
restrict its OS permissions (Windows ACLs must be set by the operator), and do
not upload it. Directory creation requests mode 0700 on POSIX. The gitignore
patterns are defense in depth, not permission to put credentials in the repo.
Library logging is disabled. Adapter logs contain only fixed lifecycle/error
labels and mask number-like strings; raw errors, JIDs, message bodies, session
paths, QR values and pairing codes are never passed to the logger. Callbacks
handling pairing material must preserve that policy.

The workspace pins a pnpm patch for transitive `libsignal@6.0.0` that suppresses
its direct console calls, including session-object dumps that bypass pino.
Use pnpm so this privacy patch is applied; review it when upgrading dependencies.
Baileys itself is MIT; its dependency tree has separate licenses (the installed
libsignal manifest declares GPL-3.0), so distribution requires a dependency
license review.

No real-account integration is run by the test suite. Manual pairing, delivery,
and provider-side ban behavior still need validation with the authorized test
number. Multi-file auth is experimental local persistence, not a production
credential vault; application-level deduplication cannot guarantee exactly-once
delivery across a network disconnect.
