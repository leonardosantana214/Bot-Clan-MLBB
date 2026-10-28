# Estratégia de sincronização

Status: **Proposta / Pendente**.

## Direção dos dados
- **Host → nuvem (réplica de leitura):** eventos de domínio versionados via `SyncOutbox` (at-least-once, idempotente por `event_id`). Controller lê.
- **Controller → Host (comandos):** tabela `remote_command` com `idempotency_key`, `expires_at`, `status`. Host faz *pull*/subscribe, valida assinatura/permissão, executa e escreve resultado.
- Host nunca expõe IP/porta.

## Regras
1. SQLite do Host é a fonte da verdade; nuvem não escreve em tabelas de domínio diretamente.
2. Eventos têm `schema_version`; consumidores ignoram versões desconhecidas e alertam.
3. Conflitos de configuração (dois ADMs): *last-writer-wins* com `version` otimista; conflito retorna erro ao segundo.
4. Comandos expiram; Host rejeita comandos vencidos ou repetidos.
5. Offline: outbox cresce com limite e alerta; replay em ordem por `sequence`.
6. Backup: dump SQLite criptografado, destino a definir; teste de restauração obrigatório antes da Etapa 7.
7. Nunca replicar: sessão WhatsApp, conteúdo de mensagens, segredos.
8. Autorização no Postgres via RLS por `admin_account`/papel; Host usa credencial de serviço própria e restrita.

Pendente: escolher Realtime vs polling (custo/bateria no Host) — medir na PoC.
