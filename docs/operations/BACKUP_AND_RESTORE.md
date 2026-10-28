# Backup e restauração

Implementado em `@aerobot/maintenance` (testes sintéticos; não testado em aparelho real).

## Backup
- Admin envia `/backup` no grupo ADM. Gera cópia consistente (`VACUUM INTO`), manifesto com hash SHA-256 e contagens, verificação de integridade.
- Com `AEROBOT_BACKUP_PASSPHRASE` o arquivo é criptografado (AES-256-GCM). **Guarde a passphrase separada: sem ela o backup não abre.**
- Rotação: 14 diários + 4 semanais (configurável); só apaga arquivos criados pelo próprio pacote.

## Restauração
1. Pare o Host.
2. `restoreBackup(arquivo, destino)` valida manifesto, hash e integridade antes e grava em destino novo (não sobrescreve o banco atual).
3. Aponte o Host para o banco restaurado e confira `/rank`.
- Teste a restauração periodicamente: backup não testado não vale.

## Retenção (LGPD)
`applyRetention` anonimiza perfis conforme `docs/security/PRIVACY_AND_RETENTION.md`. Padrão dry-run; execução real exige flag explícita e gera auditoria. Ledger de XP e auditoria permanecem.

## Pendente
Cópia do backup para fora do aparelho (sem isso, perder o celular perde tudo).
