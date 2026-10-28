# PoC-1 — Host no Android via Termux (guia de medição)

Status: **Proposta / Pendente de execução**. Nada aqui foi medido ainda: não há aparelho conectado ao ambiente de desenvolvimento. O objetivo é decidir com números se o Host roda de forma estável no celular reserva.

## Objetivo
Responder, com dados reais: o bot (Node + Baileys + SQLite) consegue ficar ligado por dias no celular antigo sem ser morto pelo Android, e quanto consome?

## Pré-requisitos
- Celular reserva com Android (modelo/versão: anotar), carregador e Wi-Fi estável.
- Termux instalado pelo **F-Droid** (a versão da Play Store está desatualizada).
- Chip/número **de TESTE** para o WhatsApp (nunca o número principal do clã).
- Pareamento feito em terminal privado (código/QR não vai para chat nem log).

## Passos
1. No Termux: `pkg update && pkg install nodejs git`. Anotar `node -v` (o projeto usa `node:sqlite`, que exige Node 22+; se o Termux trouxer versão menor, registrar — isso é um achado, não um erro).
2. `termux-wake-lock` (ou notificação "Acquire wakelock") para evitar suspensão da CPU.
3. Configurações do Android: desativar otimização de bateria para o Termux; permitir execução em segundo plano; fixar o app nos recentes se o fabricante matar processos.
4. Clonar o repositório, `corepack pnpm install`, `corepack pnpm build`.
5. Definir `AEROBOT_SESSION_DIR` (pasta fora do repositório), `AEROBOT_TEST_GROUP` (grupo de teste) e rodar `node packages/whatsapp-baileys/dist/run.js`.
6. Parear com o número de teste e deixar rodando.

## O que medir (planilha simples, uma linha por leitura)
| Métrica | Como | Frequência |
|---|---|---|
| Processo vivo | `pgrep -f run.js` | a cada 30 min |
| RAM do processo | `ps -o rss= -p <pid>` | a cada 30 min |
| Bateria (%/temperatura) | `termux-battery-status` (Termux:API) | a cada 30 min |
| Reconexões WhatsApp | linhas do log do adapter (sem dados pessoais) | contagem diária |
| Resposta a `/ping` | enviar `/ping` no grupo de teste, anotar latência | 3×/dia |
| Mortes do processo | horário em que sumiu e causa provável | sempre |

Duração mínima sugerida: 72 h com tela apagada, 2 testes de queda de Wi-Fi e 1 reinício do aparelho.

## Critérios de decisão (propostos — ajustar com o líder)
- **Aprovado**: ≥ 72 h sem morte do processo, RAM estável (sem crescimento contínuo), bateria sem inchar/esquentar, reconexão automática após queda de rede.
- **Reprovado**: processo morto repetidamente pelo sistema ou RAM crescendo sem parar → seguir para a alternativa (serviço nativo em primeiro plano com `foregroundServiceType`, ou Host em outra máquina).

## Riscos já conhecidos
- Android pode matar processos em segundo plano (varia por fabricante).
- Baileys não é oficial; manter número dedicado, sem envio em massa.
- Celular ligado 24 h no carregador: monitorar bateria.

## Resultado
Preencher após o teste: modelo, versão do Android, versão do Node, tabela de medições, decisão. Registrar também no `RISK_REGISTER.md`.
