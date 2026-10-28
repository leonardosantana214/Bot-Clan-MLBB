# Resposta a incidentes (proposta)

| Situação | Ação |
|---|---|
| Número banido/sessão revogada | Parar o Host, não reconectar em loop, avaliar com os ADMs; manter número dedicado. |
| Sessão ou token vazado | Revogar sessões do Controller (logout geral), trocar senha ADM (novo hash), recriar a sessão do WhatsApp. |
| Bot respondendo errado/spam | `AEROBOT_PAUSED=1` e reiniciar; revisar a rota do grupo. |
| Banco corrompido | Restaurar o último backup válido (ver BACKUP_AND_RESTORE). |
| Dado pessoal exposto | Registrar o que/quando, remover da origem, avisar os envolvidos. |
| API de heróis fora do ar | O bot usa cache e avisa alto tráfego; nada a fazer. |

Senha, token, código de pareamento e backups nunca vão para o repositório, chat ou issue.
