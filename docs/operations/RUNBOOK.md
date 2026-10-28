# Runbook do Host (operação)

Status: baseado no código atual. **Nunca testado com WhatsApp real nem em Android real.**

## Subir o Host manual
1. Node 22+ (`node:sqlite`). `corepack pnpm install && corepack pnpm build`.
2. Variáveis de ambiente (nenhuma vai para o repositório):
   - `AEROBOT_SESSION_DIR`: pasta da sessão e do `bot.sqlite`, **fora** do repositório.
   - `AEROBOT_TEST_GROUP`: id do grupo comum (CHAT/teste).
   - `AEROBOT_ADMIN_GROUP`: id do grupo ADM. Sem ela os comandos administrativos e as notificações ficam desligados.
   - `AEROBOT_PAIRING_PHONE`: número de TESTE, para pareamento por código (senão QR).
   - `AEROBOT_BACKUP_DIR` (padrão `<sessão>/backups`) e `AEROBOT_BACKUP_PASSPHRASE` (opcional, criptografa backups).
   - `AEROBOT_PAUSED=1` inicia sem responder; `AEROBOT_DISABLE_MLBB=1` desliga os comandos de heróis.
3. `node packages/whatsapp-baileys/dist/run.js` em terminal privado (QR/código nunca em chat ou log).

## Rotina
- Conferir `/statusbackup` (alerta se o último backup tem mais de 36 h).
- Ver `INCIDENT_RESPONSE.md` em caso de problema.

## Regras fixas
- Número dedicado de teste; sem mensagens em massa; Baileys é não oficial (sem garantia de 100% de disponibilidade).
- Relatórios administrativos só no grupo ADM, nunca no CHAT.
