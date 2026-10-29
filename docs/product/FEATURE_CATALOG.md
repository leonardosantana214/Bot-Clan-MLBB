# Catálogo de funcionalidades — AERO

Referência: código de `main` em `ee951bd` (PR #23). Os quatro estados são independentes: **implementado** = existe código; **integrado** = ligado à composição executável; **testado com fakes** = há testes automatizados sintéticos identificados no repositório, sem afirmar execução nesta atualização; **validado em aparelho real** = evidência operacional. **Hoje nenhuma funcionalidade está validada em aparelho real ou com WhatsApp real.**

| Funcionalidade | Implementado | Integrado | Testado com fakes | Validado em aparelho real |
|---|---|---|---|---|
| `/ping /ajuda /registrar /perfil /xp` | Sim | Host/rotas | Sim: core, compose | Não |
| XP por mensagem e antiflood | Sim | Host, política global + módulo do grupo; desligado por padrão | Sim: core, compose | Não |
| Níveis, progresso e `/rank /top` | Sim; curva padrão é Proposta | Core, Host, Controller | Sim: ranking, levels-persona, control-host | Não |
| Eventos de level up e aviso no CHAT | Sim; eventos persistidos | Ledger do Host; consultas/exportações recebem levelEvents em run.ts | Sim: levels-persona | Não |
| Persona conselheiro | Sim, textos locais sem IA | Host via AEROBOT_PERSONA; padrão neutro | Sim: levels-persona | Não |
| `/heroi /meta /counter` | Sim | Host, API não oficial, cache; sem estatísticas pessoais | Sim: provider e commands | Não |
| Membro Estrela e histórico | Sim | Host CHAT e Controller/Liderança | Sim: star-member, compose, leadership | Não |
| Pontuar, fechar, desempatar, sortear e aprovar | Sim; regra do vencedor anterior ainda aguarda aprovação | Host ADM e Controller/Liderança | Sim: star-member, leadership | Não |
| Entradas/saídas e revisão de saída | Sim, com risco #28 | Host/community; revisão não garante cobertura de todos os grupos | Sim: community, compose | Não |
| Notificações ADM | Sim, com risco #27 | Host/community; confirmado não é recibo WhatsApp | Sim: community | Não |
| Boas-vindas | Sim | Host condicionado ao módulo do CHAT, desligado por padrão | Sim: community, compose | Não |
| Moderação assistida e advertências | Sim; sem punição automática | Host/rotas e Controller/Liderança | Sim: community, leadership | Não |
| Backup e status | Sim | Comandos ADM e Controller; cópias separadas dos bancos | Sim: maintenance, leadership | Não |
| Restauração e retenção | Sim: serviços de manutenção | Restauração fora do Controller; retenção sem agendamento automático | Sim: maintenance | Não |
| CSV e conjuntos para Power BI/Excel | Sim; pseudonimizados | Host e Controller; download completo no navegador, prévia no nativo | Sim: exports, leadership | Não |
| Scout manual | Sim; escopo proposto | SQLite e Controller/Liderança; sem coleta pessoal automática | Sim: scout, leadership | Não |
| Login administrativo e HTTP | Sim: senha única, scrypt, sessão, bloqueio | Host e RemoteControllerApi/AuthProvider | Sim: control, http, control-host | Não |
| QR, desconexão e papéis CHAT/ADM | Sim | Adapter + Host + Controller; papéis exigem reinício | Sim: pairing com sockets falsos e HTTP loopback | Não |
| Status, pausa, manutenção, módulos e contagens | Sim | Host/control.sqlite e Controller | Sim: control-host, leadership | Não |
| UI AERO, estados vazios e navegação | Sim | Expo/React Native/web | Parcial: contratos/serviços; validação visual completa não confirmada | Não |
| APKs e Host Android/PoC-1 | Não confirmado: sem entrega operacional | Pendente | Não confirmado | Não |
| Distribuição/execução iOS | Configuração Expo e script presentes | Build e execução pendentes | Não confirmado | Não |
| Brincadeiras de texto, quiz e figurinhas | Propostas | Não | Não | Não |

Evidências: `packages/*/tests`, `packages/whatsapp-baileys/src/{compose,run,control-host,leadership-host}.ts` e `apps/controller/src/services/remote.ts`. A presença de testes não certifica toda a UI nem integrações externas. A pesquisa anterior registra consulta à API MLBB real; ela não foi repetida nesta atualização e não comprova WhatsApp/aparelho real. Música fica fora do escopo.
