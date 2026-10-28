# AeroBot Controller

Expo/React Native/web. Login começa no modo real. A opção **Modo demonstração** usa mocks locais (senha `aeroclan-admin`), separados da conexão real. Não ative essa opção para conectar ao Host HTTP de demonstração.

## Teste no PC

PowerShell na raiz do monorepo, Node 22 e pnpm 9:

```powershell
corepack pnpm install
corepack pnpm build
$env:AEROBOT_CONTROL_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
corepack pnpm --filter @aerobot/whatsapp-baileys control-demo
```

O Host usa SQLite temporário, cinco membros fictícios com XP e FakeWhatsAppAdapter. Imprime URL e senha aleatória nova a cada execução, apenas no terminal local. Não exige WhatsApp. Ctrl+C fecha o servidor e remove o SQLite. Senha não é gravada em arquivo.

Em outro terminal, na mesma raiz:

```powershell
corepack pnpm --filter @aerobot/controller web --port 8081
```

Abra `http://localhost:8081`. Deixe **Modo demonstração** desligado. Informe `http://127.0.0.1:8787` no campo **Endereço do Host** e a senha do terminal. Teste pausa/retomada, ranking e exportações. Só o endereço é salvo no localStorage quando disponível. Token fica em memória; sair ou recarregar exige novo login. Senha nunca é persistida.

## Celular na mesma rede

Substitua `192.168.0.10` pelo IPv4 do PC. Pare o Host anterior e execute:

```powershell
$env:AEROBOT_CONTROL_HOST = '0.0.0.0'
$env:AEROBOT_CONTROL_PORT = '8787'
$env:AEROBOT_CONTROL_ORIGINS = 'http://192.168.0.10:8081,http://localhost:8081'
corepack pnpm --filter @aerobot/whatsapp-baileys control-demo
```

No outro terminal, execute o comando web acima. No celular, abra `http://192.168.0.10:8081`; informe `http://192.168.0.10:8787` como Host. O firewall precisa permitir 8081 e 8787 na rede privada. Não use localhost no celular. A origem precisa coincidir exatamente com a URL do Controller, incluindo porta. Se o Expo usar outra porta, ajuste as origens e reinicie o Host.

Bind padrão: `127.0.0.1`. Somente `AEROBOT_CONTROL_HOST=0.0.0.0` habilita LAN, com aviso em stderr: **HTTP sem TLS**, apenas para teste em rede confiável. Em produção use TLS/túnel. Página HTTPS não pode chamar Host HTTP por mixed content; use HTTPS em ambos. Instalação PWA também depende de contexto seguro.

## Host real com WhatsApp

`run.ts` só inicia a API quando `AEROBOT_CONTROL_PORT` e `AEROBOT_ADMIN_PASSWORD_HASH` estão definidos. Preserve a configuração usual de sessão/grupos. Gere o hash sem gravar a senha:

```powershell
$secret = Read-Host 'Senha administrativa (mínimo 10 caracteres)' -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $secret).Password
$env:AEROBOT_ADMIN_PASSWORD_HASH = ($plain | corepack pnpm --silent --filter @aerobot/control-protocol hash-password | Out-String).Trim()
Remove-Variable plain, secret
$env:AEROBOT_CONTROL_PORT = '8787'
$env:AEROBOT_CONTROL_HOST = '127.0.0.1'
$env:AEROBOT_CONTROL_ORIGINS = 'http://localhost:8081'
corepack pnpm --filter @aerobot/whatsapp-baileys start
```

Não grave senha/hash no repositório. Para LAN use bind e origens explícitas do exemplo anterior. SIGINT/SIGTERM fecham a API com o Host.

## Recursos e limites

- Estado, conexão, fila e envios recentes vêm do adapter. Pausa chama `adapter.setPaused`, descarta respostas pendentes e mantém a contabilização de mensagens.
- Ranking usa `rankByPeriod` e ledger SQLite: geral, semanal e mensal. Diário indisponível. UI mostra geral; nível deriva do XP total. Função MLBB, elo e ofensiva aparecem como indisponíveis.
- Exportações de membros, ranking e auditoria usam `@aerobot/exports` para escapar CSV. Retornam prévia limitada a 8192 caracteres e total de linhas; não salvam arquivo completo. Membros não incluem identificadores WhatsApp. Auditoria inclui eventos administrativos persistidos.
- Métricas agregadas, grupos/módulos editáveis, manutenção, logs de execução de comandos e configurações globais não têm implementação correspondente no Host atual: erro `unsupported`, exibido como indisponível, sem dados inventados.
- Sessão expirada retorna ao login. Erros de rede/login em pt-BR sem detalhes internos.

## Build web

```powershell
corepack pnpm --filter @aerobot/controller build:web
```

Saída: `apps/controller/dist`. Metro habilita package exports para usar a entrada browser do protocolo, sem módulos Node.
