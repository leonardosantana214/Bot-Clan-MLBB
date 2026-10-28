# ADR-0005 — XP e pontuações como ledger append-only

Status: **Proposta / Pendente**

**Decisão:** XP e pontos do Membro Estrela são lançamentos imutáveis (`xp_transaction`, `score_entry`); saldos e níveis são derivados e reconstruíveis; correções são lançamentos compensatórios com autor e justificativa.
**Consequências:** auditabilidade e contestação; custo de recomputar (mitigado por cache derivado).
