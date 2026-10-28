# Changelog

## [Não lançado]
### Adicionado
- Documentação de discovery, arquitetura, dados, segurança, riscos e roadmap (Etapa 0).
- `@aerobot/core`: registro de comandos (`/ping /ajuda /registrar /perfil /xp`), ledger de XP append-only, antiflood, níveis configuráveis, rate limit.
- `@aerobot/storage-sqlite`: persistência em SQLite (node:sqlite), WAL, migrações, triggers append-only (PR #1).
- `@aerobot/whatsapp-baileys`: adaptador experimental do Baileys 7.0.0-rc14 com reconexão controlada e fila de envio (PR #2).
- Spike de documentação do provedor MLBB (PR #3).

### Alterado
- Teto diário de XP passa a usar o dia em America/Sao_Paulo.
- Escopo simplificado por decisão da liderança (ADR-0006).
