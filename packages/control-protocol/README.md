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
Senha única: não há rastreio por pessoa nem papéis (decisão ADR-0006). O Controller ainda usa dados mock até ser ligado a este cliente.
