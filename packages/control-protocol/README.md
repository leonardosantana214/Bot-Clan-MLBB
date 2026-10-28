# @aerobot/control-protocol

Protocolo entre o Host (fonte da verdade) e o Controller. Independe de transporte: o transporte real (ex.: Supabase) deve implementar `ControlTransport` e usar TLS.

## Segurança
- Senha única de administração, guardada só como hash scrypt (`scrypt$v=1$...`), comparação em tempo constante.
- Tokens de sessão aleatórios (32 bytes), guardados no servidor só como hash, com expiração e revogação.
- Bloqueio progressivo após tentativas erradas; erros de login genéricos; nada de senha/token em logs.
- Comandos mudam estado com `idempotencyKey`; só o Host marca `concluido`.
- Cada ação administrativa gera auditoria.

## Gerar o hash da senha
Rode `hash-password-cli` (veja `src/hash-password-cli.ts`) e guarde o resultado em variável de ambiente no Host. Nunca grave a senha em texto nem no repositório.

## Limitações
Senha única: não há rastreio por pessoa nem papéis (decisão ADR-0006). O Controller oferece conexão HTTP de teste e modo demonstração explícito.

## HTTP de teste

`HttpControlServer(handler, { port, host?, origins?, timeoutMs? })` recebe JSON em `POST /control`, com limite de 64 KiB e timeout padrão de 10 s. `listen()` retorna a URL; porta zero seleciona uma porta efêmera. `close()` encerra conexões. Bind padrão `127.0.0.1`; `0.0.0.0` é opt-in explícito e avisa em stderr: HTTP sem TLS, apenas rede confiável de teste; em produção usar TLS/túnel. CORS usa origens exatas sem wildcard, e OPTIONS somente para preflight de POST. Nenhum corpo é logado.

`HttpTransport(address, timeoutMs?)` usa fetch e gera `ControlTransportError` (`timeout`, `network`, `http`, `invalid_json`). No navegador importe de `@aerobot/control-protocol/browser`, sem módulos Node. Erros HTTP são de transporte; erros do protocolo permanecem JSON `ok:false`. `unsupported` indica recurso indisponível no Host. O throttle HTTP usa endereço do peer em vez do campo enviado pelo cliente.
