# Registro de riscos

S = severidade, P = probabilidade (A/M/B). Responsável = papel proposto.

| ID | Risco | S | P | Mitigação | Resp. |
|---|---|---|---|---|---|
| R-01 | Banimento da conta WhatsApp | A | M | Número dedicado, baixo volume, adapter substituível, plano com Cloud API | Líder/Eng |
| R-02 | Quebra de compatibilidade do Baileys | A | A | Isolar em adapter, pin de versão, monitorar releases | Eng |
| R-03 | Android suspende o processo | A | A | PoC em aparelho real; FGS; whitelist de bateria; plano D | Eng |
| R-04 | Aparelho desliga/sem internet | M | A | Fila offline, reconexão, alerta "Host offline" | Eng |
| R-05 | Corrupção do SQLite | A | B | WAL, backups, teste de restauração | Eng |
| R-06 | Falha de sync | M | M | Outbox idempotente, reconciliação | Eng |
| R-07 | Acesso admin indevido | A | B | MFA, RBAC/RLS, auditoria | Eng |
| R-08 | Vazamento de dados | A | M | Minimização, retenção, sem PII em logs/Git | Todos |
| R-09 | API MLBB obsoleta/instável | M | A | Provider desacoplado, dados manuais | Eng |
| R-10 | Eventos duplicados | M | M | Dedupe por ID, idempotência | Eng |
| R-11 | Ranking incorreto | M | M | Ledger + testes de regressão | Eng/QA |
| R-12 | Sorteio contestável | A | M | Lista congelada, seed, aprovação (A6) | Líder |
| R-13 | Bateria/calor excessivos | M | M | Medição na PoC, carregador | Eng |
| R-14 | Mídia enche o armazenamento | B | M | Limites e limpeza | Eng |
| R-15 | Alertas em excesso | B | M | Agregação, preferências | Produto |
| R-16 | Conflito entre ADMs | M | M | Versão otimista, auditoria | Líder |
| R-17 | Falha em builds iOS | M | M | Exigir Mac/EAS e conta Apple; validar cedo | Eng |
| R-18 | Custos não previstos (Supabase, Apple $99/ano, VPS) | M | M | Estimativa por etapa | Líder |
| R-19 | Ponto único de falha (um aparelho) | A | A | Backup de sessão local seguro, plano D | Eng |
| R-20 | Pontuação percebida como injusta | A | M | Critérios publicados, contestação, revisão humana | Líder |
