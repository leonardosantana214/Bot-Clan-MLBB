# ADR-0002 — Baileys como experimento atrás de WhatsAppAdapter

Status: **Proposta / Pendente**

**Contexto:** Baileys é não oficial, sem suporte da Meta; risco de ban e quebras.
**Decisão:** toda interação passa por `WhatsAppAdapter`; desenvolvimento e testes usam `FakeWhatsAppAdapter`; Baileys só em integração experimental com número dedicado; sem evasão de detecção. Avaliar Cloud API em paralelo.
**Consequências:** motor testável sem WhatsApp; troca de provedor possível; custo de manter a abstração.
