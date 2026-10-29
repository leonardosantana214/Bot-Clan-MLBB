# PoC-1 — Host no Android via Termux (guia de medição)

Status de execução: **Não verificado**. Decisão de plataforma confirmada no [ADR-0007](../decisions/ADR-0007-android-first.md). Siga o [guia passo a passo atualizado](HOST_ANDROID_TERMUX.md) para instalar, proteger a senha e parear pelo Controller; os passos abaixo são o roteiro de medição. Nada aqui foi medido ainda: não há aparelho conectado ao ambiente de desenvolvimento. O objetivo é decidir com números se o Host roda de forma estável no celular reserva.

## Objetivo
Responder, com dados reais: o bot (Node + Baileys + SQLite) consegue ficar ligado por dias no celular antigo sem ser morto pelo Android, e quanto consome?

## Pré-requisitos
- Celular reserva com Android (modelo/versão: anotar), carregador e Wi-Fi estável.
- Termux instalado pelo **F-Droid** (a versão da Play Store está desatualizada).
- Chip/número **de TESTE** para o WhatsApp (nunca o número principal do clã).
- Pareamento pelo Controller em tela privada (QR não vai para chat nem log).

## Passos — Não verificado

Siga o [guia atualizado do Host Android](HOST_ANDROID_TERMUX.md), que inclui instalação com lockfile congelado, senha externa ao repo, início com limite de reinícios e pareamento pelo Controller. Depois registre as medições abaixo. Nenhum passo foi executado em aparelho real.

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
