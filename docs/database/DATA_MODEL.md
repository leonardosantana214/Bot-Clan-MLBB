# Modelo de dados inicial

Status: **Proposta / Pendente**. SQLite no Host; espelho Postgres para leitura. IDs: ULID/UUIDv7 em texto. Todas as tabelas: `id`, `created_at`, `updated_at` (UTC). Migrações versionadas e reversíveis quando possível.

## Domínios e tabelas

**Comunidade/rotas:** `community`, `group_route` (UNIQUE `platform_group_id`; `role`, `modules` JSON, `allowed_commands`, `notify_prefs`).

**Identidade:** `member` (aero_id, display_name, status), `whatsapp_identity` (UNIQUE `platform_user_id`; FK member), `mlbb_account` (UNIQUE `game_id+server_id`; `verification_status`), `member_consent` (tipo, versão do texto, data, revogado_em), `membership` (member×group; status), `membership_event` (append-only: join/leave/..., origem, ocorrido_em).

**Atividade/XP:** `message_activity` (apenas `platform_message_id` hash, member, group, ts, kind; **sem conteúdo**; UNIQUE por id), `activity_event`, `xp_transaction` (append-only: delta, razão, referência, regra_versão), `level_progress` (derivado/cache), `achievement`, `member_achievement`.

**Membro Estrela:** `score_period` (aberto/fechado), `score_entry` (categoria, pontos, justificativa, autor), `score_evidence`, `score_result` (mérito, elegíveis), `penalty`, `warning`.

**Rising/partidas:** `rising_event`, `rising_registration`, `team`, `team_member`, `match_result` (UNIQUE match key), `match_evidence`.

**Sorteios:** `raffle`, `raffle_eligibility` (lista congelada), `raffle_result` (seed, procedimento, aprovado_por).

**Comunidade:** `poll`, `poll_vote`, `birthday` (opcional/consentido).

**Operação:** `notification` (estado, idempotency_key), `report`, `admin_account`, `permission`, `audit_log` (append-only; ator, ação, alvo, antes/depois resumidos), `bot_host`, `bot_connection`, `sync_outbox`, `remote_command`, `integration_state`, `mlbb_snapshot` (fonte, coletado_em, intervalo, confiabilidade, completude, payload).

## Princípios
- Saldos (XP, nível, pontos) são **derivados** de lançamentos; caches reconstruíveis.
- Índices: `(member_id, ts)` em atividade; `(group_id, ts)`; `(period_id, member_id)` em score_entry; únicos para deduplicação.
- Exclusão: soft-delete + job de anonimização conforme retenção; `audit_log` mantém referência anonimizada.
- Transações em toda operação que escreve ledger + outbox (padrão *transactional outbox*).
