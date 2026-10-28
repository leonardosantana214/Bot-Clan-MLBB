# @aerobot/mlbb-commands

Comandos de WhatsApp sobre dados públicos de heróis do MLBB (via `@aerobot/mlbb-provider`).

| Comando | Uso | Observação |
|---|---|---|
| `/heroi <nome>` | `/heroi Miya` | Busca por nome (sem diferenciar maiúsculas) |
| `/meta [dias] [rank]` | `/meta 7 mythic` | Top 5; dias: 1, 3, 7, 15, 30 (padrão 7); rank: all, epic, legend, mythic, honor, glory (padrão all) |
| `/counter <nome>` | `/counter Miya` | Top 5 counters |

## Uso

```ts
import { createBot } from '@aerobot/core';
import { ArenaProvider } from '@aerobot/mlbb-provider';
import { createMlbbCommands } from '@aerobot/mlbb-commands';

const bot = createBot({ /* ... */, extraCommands: createMlbbCommands(new ArenaProvider({ cachePath })) });
```

Os grupos só respondem aos comandos listados em `allowedCommands` da rota (`heroi`, `meta`, `counter`).

## Notas
- Entrada limitada a 40 caracteres, sem caracteres de controle; entrada inválida não gera nenhuma requisição.
- Erros do serviço viram mensagens amigáveis; nada interno é exposto.
- Dados vêm de um serviço **não oficial** (Rone Arena) sem garantia de disponibilidade; há cache de 5 minutos e fallback para dados antigos.
- Sem estatísticas pessoais de jogador (decisão da liderança; ver `docs/api/MLBB_PROVIDER_RESEARCH.md`).
