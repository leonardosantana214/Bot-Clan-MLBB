# Marcos e caminho crítico

## Caminho crítico
`PoC Host (Termux→nodejs-mobile) → decisão ADR-0003 → Foundation (engine+SQLite+fake adapter) → Community Engine → Sync/Controller → Analytics → MLBB/Rising`

A UI do Controller só começa depois do PoC-1 e do contrato de sync estarem estáveis.

| Etapa | Entrega | Critério de aceite | Depende de |
|---|---|---|---|
| 0 Discovery | Docs, ADRs, auditoria de ambiente, PoC-1 | Docs revisados; relatório PoC-1 com medições | — |
| 1 Foundation | Monorepo, TS, lint, testes, SQLite+migrações, CommandRegistry, GroupRouteRegistry, `/ping /ajuda /registrar /perfil /xp` com FakeAdapter | `pnpm test` verde; fronteiras de dependência verificadas | ADR-0001/0002 |
| 2 Community Engine | Atividade, XP ledger, níveis, rankings, inatividade, boas-vindas, RBAC, moderação básica, Membro Estrela (pós-aprovação A1–A5) | Contagem sem duplicidade; ranking reproduzível | Etapa 1, aprovações |
| 3 Mobile Control | Host experimental, Controller Android (iOS preparado), login, status, rotas, auditoria | Comando remoto só "concluído" após confirmação do Host | ADR-0003/0004 |
| 4 Analytics | Dashboards, relatórios, exportações, fechamento mensal | Fechamento reexportável | Etapa 2–3 |
| 5 MLBB & Rising | Spike de provedores, perfil, Rising manual auditado | Dados com fonte/data/completude | Spike MLBB |
| 6 Expansão | Mídia, minigames, sorteios, enquetes | Sorteio auditável (A6 resolvido) | Etapa 2 |
| 7 Estabilização | Longa duração, hardening, backups, runbook, builds | Teste ≥ 14 dias no aparelho real | Todas |

Primeiros passos práticos: (1) ADM aprova A9/A13; (2) PoC-1; (3) bootstrap do monorepo.

## Progresso (2026-10-28)
| Item | Estado |
|---|---|
| Docs de discovery e ADRs 0001–0006 | Feito |
| Foundation: core + comandos básicos (fake adapter) | Feito (PR inicial) |
| Persistência SQLite | Feito (PR #1) |
| Adaptador Baileys | Feito, **não testado com WhatsApp real** (PR #2) |
| Spike MLBB (documentação) | Feito (PR #3); estatísticas pessoais fora do escopo |
| PoC do Host Android em aparelho real | **Pendente — caminho crítico** |
| UI do Controller | Bloqueado: acesso ao Gemini/Antigravity |
| Canal Host ↔ Controller, login simples | Não iniciado |
| `MLBBProvider` (heróis) | Próximo |
