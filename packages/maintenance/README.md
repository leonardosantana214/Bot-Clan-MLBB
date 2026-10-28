# @aerobot/maintenance

Backup, restauração e retenção do SQLite do bot.

## Backup
`VACUUM INTO` gera cópia consistente, com escrita atômica, manifesto JSON (versão do schema, contagens, SHA-256) e verificação de integridade. Criptografia opcional AES-256-GCM com chave derivada (scrypt) de uma passphrase em variável de ambiente; a passphrase nunca é gravada nem logada. Pasta de backups fora do repositório.

## Rotação
Mantém os N mais recentes e apaga só arquivos criados pelo próprio pacote, dentro da pasta de backups.

## Restauração
`restoreBackup(arquivo, destino)` valida manifesto, hash e integridade antes e nunca sobrescreve o banco atual sem pedido explícito.

## Retenção (LGPD)
`applyRetention` anonimiza perfis conforme `docs/security/PRIVACY_AND_RETENTION.md`. O padrão é dry-run; a execução real exige flag explícita e gera auditoria. Ledger de XP e auditoria permanecem append-only.

## Comandos (rota de administração)
`/backup`, `/statusbackup`. A autorização é por rota: o host só deve registrá-los no grupo de administração.

## Não coberto
Backup fora do aparelho (cópia remota) e restauração automática.
