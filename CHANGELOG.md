# Changelog

## [Não lançado]

### Atualização AERO — PRs #16–#23

Conferido pelo histórico local e código de `main` em `ee951bd`; não representa release móvel nem validação com WhatsApp real.

- **#16 — Controller via HTTP:** transporte e cliente do protocolo real, login no Host, status, grupos, ranking, exportações e Host de demonstração com adapter fake.
- **#17 — QR e pareamento:** conexão/desconexão, QR temporário autenticado, proteção por loopback e seleção persistida de grupos CHAT/ADM, aplicada após reinício. Testes com sockets falsos.
- **#18 — Design AERO:** nome do clã AERO, identidade preta, vermelha e dourada, fontes, tokens e componentes do Controller.
- **#19 — Progressão e persona:** curva difícil configurável `ceil(200*level^2.5)` (Proposta), eventos persistidos e aviso de level up, persona conselheiro opcional (padrão neutro). XP por mensagem continua desligado por padrão.
- **#20 — Controller ampliado:** liderança, membros/histórico de XP, analytics, Membro Estrela, advertências, backup, manutenção, módulos por grupo, exportações CSV para Power BI e Scout manual. Não comprova dashboard Power BI publicado nem estatísticas pessoais automáticas do MLBB.
- **#21 — Senha simples:** `AEROBOT_ADMIN_PASSWORD`, derivada por scrypt em memória; alternativa por hash preservada. Credenciais ficam fora do repositório público.
- **#22 — Correções da auditoria:** privacidade de nomes e exportações, proteção do login, idempotência/deduplicação, elegibilidade de sorteio, validação de níveis, ajuda por rota e integração dos eventos de nível nas consultas/exportações do Host. Não encerra os riscos conhecidos #27–#29, documentados como Proposta/Pendente.
- **#23 — Polimento visual:** estados vazios, feedback visual, navegação e documentação dos riscos de dependências. Migração para Zod 4 permanece pendente.

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
