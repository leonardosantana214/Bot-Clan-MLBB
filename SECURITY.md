# Política de segurança — AERO

Reporte vulnerabilidades de forma privada à liderança técnica da AERO. Não publique detalhes exploráveis, dados pessoais ou material de sessão em issues.

O repositório **Bot-Clan-MLBB é público**. Senhas, hashes, tokens, sessões WhatsApp, QR, backups e dados reais devem ficar fora dele. Se houver vazamento, revogue a credencial/sessão e trate o histórico conforme o processo de incidentes.

## Administração atual

O Controller já se conecta ao Host por HTTP e usa senha única administrativa, sem contas individuais ou papéis. Configure `AEROBOT_ADMIN_PASSWORD` fora do repositório (exemplo documental: `<sua-senha>`, substituído por uma senha privada de pelo menos 10 caracteres). O Host deriva scrypt em memória; há bloqueio progressivo de login e sessões com expiração. A alternativa `AEROBOT_ADMIN_PASSWORD_HASH` tem prioridade quando presente.

O servidor usa `127.0.0.1` por padrão. HTTP não protege senha, tokens e QR em trânsito: acesso remoto depende de TLS/túnel confiável. Pareamento e leitura de QR exigem autenticação e loopback por padrão; a opção explícita de confiança de rede não adiciona criptografia.

No WhatsApp, política v1: **quem consegue escrever no grupo ADM pode executar os comandos administrativos permitidos nessa rota**. Não há verificação individual de cargo de administrador do WhatsApp. O aceite operacional e a revisão dos participantes são pendentes.

Nenhuma funcionalidade foi validada em aparelho real ou com WhatsApp real. Testes com fakes não eliminam os riscos conhecidos, inclusive os achados #27–#29.

- [Controle de acesso](docs/security/ACCESS_CONTROL.md)
- [Modelo de ameaças](docs/security/THREAT_MODEL.md)
- [Privacidade, retenção e riscos conhecidos](docs/security/PRIVACY_AND_RETENTION.md)
- [Incidentes](docs/operations/INCIDENT_RESPONSE.md)
