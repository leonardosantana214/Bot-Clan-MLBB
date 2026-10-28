# Pacotes de delegação

Integração direta disponível nesta sessão: **nenhuma automática verificada**. As CLIs `codex`, `gemini` e `opencode` existem no PC, mas não foram acionadas e não há garantia de configuração. Os pacotes abaixo são para execução manual ou futura. Cada agente trabalha em branch própria e só nos arquivos permitidos.

## P1 — Codex: Foundation do engine (após Etapa 0)
- **Escopo:** `packages/domain`, `packages/application`, `packages/contracts`, CommandRegistry, GroupRouteRegistry, FakeWhatsAppAdapter, SQLite + migração inicial.
- **Arquivos permitidos:** `packages/*`, `adapters/storage-sqlite`, `tests/*`.
- **Fora de escopo:** UI, regras de negócio pendentes (A1–A5), Baileys.
- **Aceite:** `/ping /ajuda /registrar /perfil /xp` com testes; lint de fronteiras; sem dependências de WhatsApp/RN em domain/application.

## P2 — Gemini/Antigravity: Design system e protótipo do Controller
- **Escopo:** tokens (preto/grafite/carmesim), componentes base, telas Login e Visão geral com dados sintéticos.
- **Arquivos:** `packages/design-system`, `apps/controller` (UI).
- **Aceite:** contraste AA, estados de loading/erro/vazio, sem chamadas de rede reais.
- **Depende de:** contratos de `packages/contracts`.

## P3 — OpenCode: QA e PoC-1
- **Escopo:** roteiro e medição do PoC Host em Termux; fixtures sintéticas; revisão de docs.
- **Aceite:** relatório com RAM/CPU/bateria/reconexões em 72 h.

Handoff obrigatório: resumo, arquivos, testes, decisões, riscos, pendências, próximos passos.
