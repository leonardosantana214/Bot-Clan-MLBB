# Modelo de ameaças (inicial)

Status: **Proposta / Pendente**.

| Ativo | Ameaça | Mitigação proposta |
|---|---|---|
| Sessão WhatsApp | Roubo do aparelho/backup; vazamento no Git | Só no Host, armazenamento protegido do Android, fora de backups em nuvem e do Git; revogação documentada |
| Contas de ADM | Credencial roubada; escalonamento | Auth Supabase com MFA, RBAC + RLS, sessões curtas, auditoria |
| Fila de comandos | Replay/forja | `idempotency_key`, expiração, checagem de papel no Host |
| Identidade de membro | Falsificação por nome/número digitado | Usar identificador da plataforma; vínculo MLBB com revisão de ADM |
| Pontuação | Spam/flood; edição silenciosa | Antiflood; ledger append-only; auditoria |
| Sorteio | Manipulação | Lista congelada, seed registrado, aprovação |
| Dados pessoais | Vazamento por relatório/log/export | Minimização, exports só para ADM, logs sem PII, retenção |
| Provedor MLBB | Dados falsos/obsoletos | Metadados de fonte/confiabilidade; fallback manual |
| Conta do bot | Banimento | Número dedicado, volume baixo, modo manutenção; risco aceito explicitamente (A9) |
| Dependências | Supply chain | Lockfile, auditoria de licenças, revisão de novas deps |
