# Viabilidade do Host Android

Status: **hipóteses — nada medido em aparelho real ainda.** É o maior risco técnico do projeto (R-03/R-04).

## Fatos verificados (busca 2026-10-28)
- Serviços em primeiro plano exigem notificação e, desde o Android 14, `foregroundServiceType` + permissão correspondente ([doc Android](https://developer.android.com/develop/background-work/services/fg-service-timeout)).
- Para apps que miram Android 15+, `dataSync` e `mediaProcessing` têm limite de **6 h por 24 h**; ao estourar, `onTimeout()` e o serviço deve parar em segundos, senão há exceção ([Android 15 changes](https://developer.android.com/about/versions/15/behavior-changes-15)). **Implica: `dataSync` não serve para um bot 24/7.**
- Receivers de `BOOT_COMPLETED` não podem iniciar FGS de tipos como `dataSync`, `camera`, `mediaPlayback`, `microphone` (mesma fonte).
- `specialUse`: **não verificado** (política da Play Store e limites). Para APK distribuído fora da Play, a restrição de política é menor, mas as restrições do sistema permanecem.
- `nodejs-mobile` (Janea Systems) é o sucessor recomendado de `react-native-node`; **estado atual de manutenção, versão do Node e suporte a Android 15 não verificados**.

## Alternativas
| | Descrição | Pontos fortes | Riscos |
|---|---|---|---|
| A | Node.js embutido (nodejs-mobile) em APK | APK único | Versão antiga de Node; compatibilidade com Baileys/crypto; manutenção |
| B | Serviço nativo + runtime JS (Hermes/QuickJS) | Controle do ciclo de vida | Baileys exige APIs Node; alto esforço |
| C | Termux + Node | Node completo, ótimo para **PoC** | Não é produto final; ajuste manual de bateria; Termux:Boot |
| D | Motor em VPS/PC, Host vira painel | Estável, barato (VPS pequena) | Foge do plano "celular reserva"; custo mensal |

## Plano de PoC (antes de qualquer UI)
1. **PoC-1 (Termux, 72 h)**: Node + Baileys fake/real com número de teste; tela apagada, Doze, troca Wi‑Fi/dados, reinício. Medir RAM/CPU/bateria, reconexões.
2. **PoC-2 (nodejs-mobile + FGS `specialUse`)**: mesmo teste, em APK de debug.
3. Comparar A, C e D; decidir via ADR-0003. Recomendação provisória: **C para PoC, D como plano de contingência, A só se PoC-2 passar**.

## Critérios de aprovação
≥ 7 dias com uptime medido e reconexão automática; sessão sobrevive a reinício; consumo de bateria aceitável em carregador; nenhuma ação manual além de whitelist de bateria documentada. Sem promessa de 100%.

## Pendentes
Modelo/versão do aparelho (A13), fabricante (OEMs agressivos como Xiaomi/Samsung matam processos), isenção de otimização de bateria.
