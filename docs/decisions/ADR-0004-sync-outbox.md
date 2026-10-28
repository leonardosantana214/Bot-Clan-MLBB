# ADR-0004 — Sincronização por outbox via Supabase

Status: **Proposta / Pendente**

**Decisão:** SQLite do Host é a fonte da verdade; eventos replicados por outbox idempotente ao Postgres (leitura); comandos do Controller via tabela `remote_command` consumida pelo Host. Sem exposição do IP do aparelho; sessão WhatsApp nunca replicada.
**Alternativas descartadas:** conexão direta Controller→Host (NAT, segurança); Postgres como fonte da verdade (quebra operação offline).
**Em aberto:** Realtime vs polling; custos do plano Supabase (não verificados).
