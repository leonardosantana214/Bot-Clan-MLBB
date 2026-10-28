# Changelog

## [Não lançado]
### Adicionado
- Documentação de discovery, arquitetura, dados, segurança, riscos e roadmap (Etapa 0).
- `@aerobot/core`: registro de comandos (`/ping /ajuda /registrar /perfil /xp`), ledger de XP append-only, antiflood, níveis configuráveis, rate limit.
- `@aerobot/storage-sqlite`: persistência em SQLite (node:sqlite), WAL, migrações, triggers append-only (PR #1).
- `@aerobot/whatsapp-baileys`: adaptador experimental do Baileys 7.0.0-rc14 com reconexão controlada e fila de envio (PR #2).
- Spike de documentação do provedor MLBB (PR #3).
- `@aerobot/exports`: CSV para Power BI/Excel (PR #4).
- `@aerobot/mlbb-provider`: heróis/meta/counters validados contra a API real, com textos em pt-BR (PR #4, #6).
- `@aerobot/mlbb-commands`: `/heroi`, `/meta`, `/counter` (PR #7).
- `/rank`, `/top` e `/ajuda` dinâmico no core (PR #8).
- `apps/controller`: UI Expo (mobile + PWA) com dados de demonstração (PR #5).
- Host manual (`run.ts`) registra todos os comandos.
- `@aerobot/star-member`: Membro Estrela com pontuação auditável, fechamento imutável e sorteio verificável (PR #10).
- `@aerobot/control-protocol`: protocolo Host–Controller, login scrypt, sessões e idempotência (PR #11).
- `@aerobot/community`: entrada/saída, boas-vindas e moderação assistida (PR #12).
- `@aerobot/maintenance`: backup, restauração e retenção (PR #13).
- Host liga esses pacotes; comandos administrativos só no grupo ADM (PR #14).
- Documentação operacional e guia da PoC-1 (Termux).

### Alterado
- Teto diário de XP passa a usar o dia em America/Sao_Paulo.
- Escopo simplificado por decisão da liderança (ADR-0006).
