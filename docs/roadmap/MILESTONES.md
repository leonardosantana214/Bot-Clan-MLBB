# Marcos e caminho crítico — AERO

Estado conferido em `main` (`ee951bd`, PR #23). Código e testes sintéticos já avançaram além do plano inicial: o Controller existe e está integrado antes da conclusão da PoC-1. Isso não resolve a viabilidade do Host Android. **Nenhuma funcionalidade está validada em aparelho real ou com WhatsApp real.**

## O que existe e o que falta

| Marco | Existe no código | Falta para aceite |
|---|---|---|
| Foundation | Monorepo TS, SQLite, ledger, rotas, comandos, lint e testes sintéticos | Reproduzir verificações no ambiente alvo e validar operação contínua |
| Comunidade | Membro Estrela, sorteio, moderação assistida, advertências, boas-vindas, entrada/saída, notificações | Aprovações de regras; resolver riscos #27/#28; validação operacional |
| Progressão | Curva configurável, ranking, eventos e aviso de level up, persona opcional | Aprovar curva/tom e XP por mensagem; validar avisos reais |
| Host no PC | Processo Node manual com adapter Baileys experimental e HTTP | Pareamento com conta de teste, reconexão e operação prolongada reais |
| Controller | Expo/React Native/web, design AERO, login real no Host, status e operações administrativas | Validar UI e fluxo completo em aparelhos; não confundir mock local com protocolo HTTP |
| Pareamento e grupos | QR autenticado, desconexão, persistência de CHAT/ADM e testes com sockets falsos | Pareamento WhatsApp real, expiração, logout e aplicação após reinício em teste autorizado |
| Analytics e Power BI | Consultas, contagens, séries, exportações CSV e download web | Validar dados/relatórios; dashboard Power BI publicado não confirmado; sem promessa de sync automático |
| Scout | Cadastro manual, critérios e notas auditadas | Líder aprovar escopo, finalidade e retenção |
| Backup/restauração/retenção | Serviços de manutenção; backup/status no Controller; cópias separadas dos bancos | Política de criptografia/rotação, agendamento de retenção e restauração operacional; snapshot conjunto não existe |
| Host Android / PoC-1 | Guia Termux e análise de viabilidade | Aparelho/modelo, execução e medições da PoC-1; decidir runtime pelo ADR-0003; Host Android não validado |
| APK Host | Não confirmado: nenhum artefato de distribuição demonstrado | Implementar/validar empacotamento Android, assinatura e distribuição |
| APK Controller | Código Expo e script Android presentes | Build APK reproduzível, instalação e teste real; não anunciar APK pronto |
| iOS | Configuração Expo e script iOS presentes | Build/assinatura, distribuição e teste em aparelho iOS; execução não confirmada |
| MLBB | Provedor não oficial de heróis/meta/counters e comandos | Revalidar disponibilidade externa; estatísticas pessoais automáticas fora do escopo atual |
| Expansão | Texto/quiz/figurinhas são propostas; música fora | Aprovar escopo antes de implementar; Scrim sem serviço de alertas |
| Estabilização | Testes sintéticos e correções parciais de auditoria | Riscos #27–#29, teste prolongado ≥ 14 dias em aparelho real, incidentes e recuperação |

## Próximos passos e dependências

1. Liderança confirma aparelho dedicado, conta de teste, regras e política v1 de autoridade ADM; define transporte seguro e responsável operacional.
2. Executar [PoC-1 Termux](../mobile/POC1_TERMUX.md), registrar medições e decidir runtime do Host conforme ADR-0003.
3. Validar pareamento e operação Host ↔ Controller ↔ WhatsApp em conta de teste, sem publicar QR, sessões ou dados reais.
4. Corrigir/validar os riscos de notificações, revisão de saída e filas/encerramento; aprovar retenção, backups e restauração.
5. Produzir builds móveis reproduzíveis (APKs; iOS após viabilidade), testar instalação e conduzir operação prolongada.

Supabase/outbox continua proposta arquitetural; o caminho implementado hoje é HTTP direto entre Controller e Host. As decisões de produto e os riscos não são encerrados pela existência de código: consulte [aprovações](../product/APPROVALS_PENDING.md), [catálogo](../product/FEATURE_CATALOG.md) e [privacidade](../security/PRIVACY_AND_RETENTION.md).
