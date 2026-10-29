# AERO — AeroBot Ecosystem

Plataforma em desenvolvimento para gestão do clã brasileiro de Mobile Legends: Bang Bang **AERO**. O identificador técnico do repositório continua **Bot-Clan-MLBB**; os pacotes usam `@aerobot/*`.

> Estado conferido no código de `main` em `ee951bd` (PR #23). Há motor TypeScript/Node, SQLite, adaptador Baileys experimental e Controller Expo/React Native/web integrado ao Host por HTTP, com autenticação real por senha única. **Nenhuma funcionalidade foi validada em aparelho real ou com WhatsApp real.** Não há APK de distribuição confirmado nem Host Android validado. Implementação e testes com fakes não equivalem a aceite operacional.

## O que existe

- Comandos de cadastro, perfil, XP, ranking e consulta de heróis/meta/counters; API MLBB não oficial, sem estatísticas pessoais automáticas.
- Membro Estrela, sorteio, advertências e moderação assistida, boas-vindas, backup e exportação CSV.
- Controller com login no Host, status, pausa/manutenção, QR/pareamento, escolha de grupos CHAT/ADM, membros, analytics, liderança, exportações para Power BI e Scout manual.
- Progressão configurável, eventos persistidos de level up e aviso no CHAT. A curva `ceil(200*level^2.5)` é **Proposta**, mesmo já implementada como padrão. XP por mensagem vem desligado; persona conselheiro vem desligada (estilo neutro).

Limitações e aprovações: [catálogo](docs/product/FEATURE_CATALOG.md), [pendências da liderança](docs/product/APPROVALS_PENDING.md) e [riscos conhecidos](docs/security/PRIVACY_AND_RETENTION.md). Power BI recebe CSV; não há confirmação de dashboard publicado ou sincronização automática. Scout não coleta estatísticas pessoais do MLBB.

## Rodar Host + Controller no PC

Pré-requisitos: Node **22** e Corepack com pnpm **9.15.9**. Na raiz do monorepo:

```powershell
$env:CI = 'true'
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

Para experimentar HTTP sem WhatsApp, em um terminal:

```powershell
$env:AEROBOT_CONTROL_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
corepack pnpm --filter @aerobot/whatsapp-baileys control-demo
```

O demo usa SQLite temporário e adapter fake, com dados sintéticos. Mostra uma senha temporária no terminal privado; o QR é fictício. Em outro terminal:

```powershell
corepack pnpm --filter @aerobot/controller web --port 8081
```

Abra `http://localhost:8081`, deixe **Modo demonstração** desligado para usar HTTP, informe o Host `http://127.0.0.1:8787` e a senha do terminal. O modo demonstração local da UI é um mock separado, sem conexão com o Host.

## Host experimental com WhatsApp

Use somente uma conta de teste autorizada. Este procedimento ainda precisa de validação real. Após instalar e compilar, configure no terminal do Host:

```powershell
$env:AEROBOT_ADMIN_PASSWORD = '<sua-senha>'
$env:AEROBOT_CONTROL_PORT = '8787'
$env:AEROBOT_CONTROL_HOST = '127.0.0.1'
$env:AEROBOT_CONTROL_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
corepack pnpm --filter @aerobot/whatsapp-baileys start
```

`<sua-senha>` é apenas um marcador: substitua por uma senha privada com pelo menos **10 caracteres**. **O repositório é público: a senha deve ficar fora dele**, assim como hashes, sessões, QR, backups e dados pessoais. O Host deriva o hash scrypt em memória ao iniciar; `AEROBOT_ADMIN_PASSWORD_HASH` continua como alternativa e tem prioridade. A API precisa de porta e senha/hash configurados.

Inicie o Controller com o comando web acima, faça login sem modo demonstração e use **Conexão → Gerar novo QR**. Sem `AEROBOT_TEST_GROUP` e `AEROBOT_ADMIN_GROUP`, escolha grupos distintos para CHAT e ADM pelo Controller e reinicie o Host. As variáveis de ambiente, quando definidas, prevalecem sobre os papéis salvos. No modo serviço, QR não aparece no terminal.

O bind padrão é loopback. QR exige autenticação e loopback por padrão. Acesso remoto exige TLS/túnel confiável e configuração explícita; `AEROBOT_CONTROL_TRUST_NETWORK=1` declara confiança e **não implementa TLS**. Veja [controle de acesso](docs/security/ACCESS_CONTROL.md) e os detalhes do [Controller](apps/controller/README.md).

## Navegação e verificação

Comece em [docs/INDEX.md](docs/INDEX.md). Para desenvolvimento: `corepack pnpm lint`, `corepack pnpm test` e `corepack pnpm typecheck`. APKs, Host Android/PoC-1, pareamento real e iOS estão no [roadmap](docs/roadmap/MILESTONES.md). As regras propostas dependem da liderança; não há IA generativa na v1 nem garantia de disponibilidade contínua.
