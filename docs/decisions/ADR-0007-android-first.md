# ADR-0007 — Android primeiro: Host no Termux, Controller Android+iOS(PWA)

Status: **Confirmado pelo líder**. Data: 2026-10-28.

## Decisão

Por enquanto o Host roda no Android via Termux. O Controller atende Android como app nativo e iOS como PWA. A referência operacional é [Host Android](../mobile/HOST_ANDROID_TERMUX.md). Nome e ícone AERO permanecem.

## Consequências e riscos

- Android pode matar o Termux. Wake lock e bateria sem otimização não garantem disponibilidade; reinício automático é limitado e não sobrevive à morte do Termux/reboot.
- Node <22 não oferece o runtime exigido; o instalador aborta. O projeto declara Node 22; outras versões e disponibilidade do Corepack no Termux exigem validação.
- HTTP cleartext é restrito a localhost/127.0.0.1 na configuração nativa Android. A API deve permanecer em loopback; HTTP não fornece confidencialidade em trânsito.
- Acesso remoto/iOS exige HTTPS e implantação com certificado/origens apropriadas: **Proposta/Pendente**. A PWA no iPhone não alcança o Android por loopback e pode bloquear conteúdo misto.
- Configuração Expo local dispensa novas dependências. Build/APK, permissões efetivas e operação em aparelho: **Não verificado**.
- Nenhum aparelho ou conta WhatsApp real foi testado. A decisão de produto não equivale a aprovação de estabilidade, consumo ou entrega remota.

A PoC-1 continua necessária para medir estabilidade. Esta decisão atualiza a orientação provisória de runtime do ADR-0003, sem afirmar resultados experimentais.
