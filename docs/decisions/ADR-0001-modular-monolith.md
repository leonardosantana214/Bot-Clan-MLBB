# ADR-0001 — Monólito modular com arquitetura hexagonal

Status: **Proposta / Pendente**

**Contexto:** comunidade pequena, um aparelho Host, equipe reduzida, múltiplos agentes.
**Decisão:** um único processo (engine) com módulos separados por portas/adaptadores; sem microserviços e sem `sync-api` próprio.
**Consequências:** deploy simples, menos falhas distribuídas; exige disciplina de fronteiras (lint). Extrair serviços só se houver necessidade medida.
