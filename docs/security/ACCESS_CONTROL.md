# Controle de acesso (estado atual)

- Autorização do bot é **por rota de grupo**: cada grupo tem uma lista de comandos permitidos. Comandos administrativos (`/pontuar /fecharestrela /sortearestrela /aprovarsorteio /desempatar /advertir /advertencias /backup /statusbackup`) existem apenas na rota do grupo ADM, definida por `AEROBOT_ADMIN_GROUP`. Sem a variável, ficam desligados. Quem está no grupo ADM é controlado no WhatsApp pelos admins do clã.
- Controller: senha única de administração verificada pelo Host (`@aerobot/control-protocol`: scrypt, tokens com expiração, bloqueio progressivo, auditoria). Sem contas individuais nem papéis (ADR-0006). **O app Controller ainda usa dados de demonstração e não está ligado a esse protocolo.**
- Membro vê apenas os próprios dados; nenhum identificador do WhatsApp aparece em respostas públicas.
