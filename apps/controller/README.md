# AERO

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

`run.ts` só inicia a API quando `AEROBOT_CONTROL_PORT` e `AEROBOT_ADMIN_PASSWORD_HASH` estão definidos. Nesse modo serviço, dispensa TTY e nunca imprime QR/código no terminal. Sem controle, mantém o pareamento no terminal privado com TTY. Gere o hash sem gravar a senha:

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

## Operação da liderança

O modo real (inclusive `control-demo`) expõe **Mais → Liderança**: Membros com busca/status/nível/período e histórico individual de XP; Analytics com filtros, série SVG de XP, atividade e top membros; Star Member com categorias/elegibilidade, pontos justificados, fechamento, sorteio com seed/compromisso e aprovação; Advertências com flags e registros por membro; Backup; Scout; política de XP. A navegação principal continua com cinco destinos. Ajustes e sair ficam também em Mais.

Todas as novas consultas e alterações exigem a sessão administrativa do protocolo v1 e auditoria. Alterações usam idempotência. Advertir, pontuar, fechar mês, sortear, aprovar, salvar Scout e anexar notas exigem confirmação. Erros não revelam caminhos nem mensagens internas. Somente a liderança que possui a senha do Controller pode operar essas funções.

**Manutenção** é persistida em control.sqlite e suspende o processamento comum nas rotas CHAT; somente mensagens do grupo ADM configurado continuam sendo processadas. Não identifica administradores individuais do WhatsApp: a autorização segue a rota ADM existente. Ao ativar, respostas já enfileiradas são descartadas; respostas novas são verificadas também antes do envio. A contabilização de recebidos continua. Pausa de respostas é o controle independente do adapter; não é automaticamente removida ao sair da manutenção.

**Grupos → Módulos e atividade** usa nomes reais do adapter, contagem de participantes quando fornecida (caso contrário, Indisponível) e contagem diária do Host. Boas-vindas, XP, comandos MLBB e moderação assistida são persistidos por grupo e aplicados na composição/roteamento. Apenas rotas ativas podem ser alteradas; configurar papéis exige reiniciar. Scrim permanece indisponível porque não há serviço de alertas. Moderação registra flags, sem apagar mensagens ou punir automaticamente. XP exige módulo do grupo e política global habilitados; alterações da política passam por Zod e exigem reiniciar o Host.

O Host conta eventos recebidos do adapter em control_daily (grupo/dia São Paulo), incluindo grupos sem rota, sem armazenar conteúdo. A coleta começa nesta versão; não há preenchimento retroativo de mensagens antigas. control_seen guarda apenas SHA-256 de grupo+ID para deduplicar; reinício não duplica a contagem. O Baileys envia metadados mínimos de recebimento também para mídias sem texto; não entrega conteúdo ao contador. Outros adapters sem essa capacidade contam apenas os eventos que entregam em onMessage. Logs próprios registram apenas nome do comando, grupo, instante e sucesso/erro da execução/envio. Comandos desconhecidos, bloqueados por rota/módulo/manutenção ou descartados pelo rate limit não são execuções. Erros de negócio retornados como texto pelo serviço contam como execução concluída; exceções e argumentos inválidos contam como erro.

Ranking diário usa limites locais de São Paulo. Analytics mostra explicitamente que atividade por membro é baseada em entradas de XP e que a contagem de mensagens é separada por grupo/dia. O ledger atual não permite relacionar todo XP a grupo. Level-ups permanecem indisponíveis até integrar o contrato `level_events`. Persona é exposta somente quando houver configuração no módulo responsável; a edição de persona depende da outra tarefa e não foi inventada aqui.

Backup usa @aerobot/maintenance com metadados sem caminho, sinaliza ausência/idade superior a 24h e não faz rotação destrutiva pelo Controller. Cria cópias separadas de bot.sqlite (incluindo Star, comunidade e Scout) e control.sqlite (configuração, contagens e logs). As duas cópias são verificadas individualmente; não são uma transação única entre bancos. O status alerta quando qualquer uma estiver ausente ou antiga. Sem AEROBOT_BACKUP_PASSPHRASE, os backups não são criptografados, conforme indicado na tela. Nenhuma chave é enviada ao app. Restauração continua fora do Controller.

O Scout armazena somente dados informados pela liderança; [escopo a confirmar](../../packages/scout/README.md). Para editar cadastro existente, forneça seu ID interno e reentre ID MLBB/servidor: a consulta retorna apenas versões mascaradas. Notas são append-only com autor/data e triggers. Critérios são definidos pela liderança com notas 0–10.

Exportações analíticas completas são gravadas no Host em AEROBOT_EXPORT_DIR ou na pasta exports dentro da sessão. O app oferece prévia limitada a 8192 caracteres por arquivo e download completo autenticado em blocos no navegador. No app nativo, use a prévia ou acesse a pasta no Host. Chaves pseudonimizadas, IDs mascarados e proteção contra fórmulas. Consulte [POWERBI.md](POWERBI.md) e o esquema em packages/exports/README.md. Exportações administrativas existentes continuam por prévia CSV.

O `control-demo` sem WhatsApp semeia membros, histórico de XP, contagens, logs, pontos Star, advertência e candidato Scout sintéticos, usando os mesmos contratos e serviços. Deixe o toggle de mock local desligado para testar o protocolo real. Os novos recursos não são replicados no mock local antigo. Para consultar grupos, gere o pareamento fictício e aguarde 15 segundos. A pasta temporária é apagada ao encerrar normalmente o demo.

## Build web

```powershell
corepack pnpm --filter @aerobot/controller build:web
```

Saída: `apps/controller/dist`. Metro habilita package exports para usar a entrada browser do protocolo, sem módulos Node.

## Teste de conexão dentro do Controller

Use sempre um **NÚMERO DE TESTE**. Escanear o QR autoriza o bot a controlar essa conta. Não compartilhe QR, imagens dele ou capturas da tela. O QR fica somente em memória, trafega em requisição autenticada e é removido ao conectar, desconectar ou após aproximadamente 20 segundos; o WhatsApp pode substituí-lo antes. O Controller gera o SVG localmente usando `qrcode` **1.5.4 (MIT)** e `@types/qrcode` **1.5.5 (MIT)**, sem serviço externo.

### Demonstração sem WhatsApp

1. Na raiz, execute `corepack pnpm build` e `corepack pnpm --filter @aerobot/controller web --port 8081`.
2. Abra `http://localhost:8081`, ative **Modo demonstração** no login e entre conforme a instrução da tela. Abra **Conexão** e clique em **Gerar novo QR**. Aparece apenas uma moldura com marcador fictício, impossível de escanear. Após 15 segundos, a consulta automática mostra **conectado**.
3. Abra **Grupos** e atribua um grupo a CHAT e outro a ADM. Tente atribuir o mesmo grupo aos dois papéis: deve ser recusado. Os dados são rotulados como demonstração e não controlam WhatsApp.
4. Em **Conexão**, clique **Desconectar**, cancele, depois repita e confirme. Gere outro QR para repetir o fluxo. Sair da aba cancela o polling; voltar consulta novamente. Sem conectar, o polling encerra após três minutos; **Gerar novo QR** o retoma.
5. Para testar também HTTP, em outro terminal use `$env:AEROBOT_CONTROL_ORIGINS='http://localhost:8081'` e `corepack pnpm --filter @aerobot/whatsapp-baileys control-demo`. A senha temporária aparece somente nesse terminal TTY. No Controller, desative o modo demonstração, informe `http://127.0.0.1:8787` e essa senha. O Host de demonstração também rotaciona o marcador fictício a cada cinco segundos e conecta após 15 segundos, sem Baileys/rede WhatsApp. Nomes de conta e grupos indicam DEMONSTRAÇÃO. Papéis são salvos somente na pasta temporária, apagada ao encerrar normalmente o demo.

### Conta real de teste

1. Pare o demo. Configure senha/hash, porta e origens como em **Host real com WhatsApp** acima. Defina `AEROBOT_SESSION_DIR` para uma pasta privada de teste. Restrinja o acesso da pasta ao usuário que executa o Host (no Windows, confira também as ACLs NTFS).
2. Para escolher grupos pelo Controller, remova `AEROBOT_TEST_GROUP` e `AEROBOT_ADMIN_GROUP` do ambiente. Inicie `corepack pnpm --filter @aerobot/whatsapp-baileys start`. Pode executar sem TTY; o terminal não deve mostrar QR. Sem esses dois parâmetros de controle, o modo terminal continua exigindo TTY.
3. Faça login no Controller sem modo demonstração. A primeira aba é **Conexão** quando não conectado. Clique **Gerar novo QR**. No WhatsApp do número de teste, use **Aparelhos conectados → Conectar aparelho** para escanear o QR. A tela consulta a cada 2,5 segundos, sem requisições sobrepostas; cada chamada HTTP tem timeout de 10 segundos. Ao conectar, o QR some e o polling para. Uma sessão já pareada conecta diretamente, sem exigir QR.
4. Adicione a conta aos dois grupos de teste. Abra **Grupos**, escolha **Definir como CHAT** e **Definir como ADM** em grupos distintos. Leia a resposta: **reinicie o Host**. As escolhas são gravadas atomicamente em `AEROBOT_SESSION_DIR/group-roles.json` com modo POSIX `0600`, sem QR. No Windows, o Host remove a herança da ACL do arquivo e concede acesso ao SID do usuário atual via `icacls`; falhas impedem salvar. A pasta de sessão usa modo POSIX `0700`; confira também as ACLs dessa pasta no Windows para proteger os demais arquivos de sessão. Variáveis de ambiente têm prioridade sobre cada papel salvo. Nenhuma rota muda durante a execução atual.
5. Reinicie o Host na mesma pasta de sessão. Verifique `/ping` no CHAT e um comando administrativo no ADM. Comandos administrativos no CHAT devem continuar bloqueados. CHAT igual a ADM impede o Host de iniciar. Grupo desconhecido ou repetido é rejeitado ao salvar.
6. Em **Conexão**, confirme **Desconectar**: o Host tenta logout remoto e apaga somente os arquivos de autenticação Baileys; banco, backups, cache e papéis são preservados. Se estiver offline, confira também a remoção do aparelho no próprio WhatsApp. Gere novo QR para parear novamente. Se o logout remoto falhar, as credenciais locais ainda são removidas.

### Transporte seguro

Por padrão, `startPairing` é recusado para um peer fora de loopback; `getConnection` também é recusado quando contém QR. A decisão usa o IP da conexão, nunca `Origin`, `X-Forwarded-For` ou um campo do JSON. Uma resposta sem QR pode ser consultada normalmente com autenticação.

Para acesso remoto, configure TLS/túnel confiável e **somente então** defina explicitamente `AEROBOT_CONTROL_TRUST_NETWORK=1` no Host. Essa flag declara confiança no transporte; ela não adiciona TLS. HTTP puro expõe QR e credenciais de login na rede. Sem a flag, a UI mostra em pt-BR que o pareamento foi bloqueado e pede loopback ou TLS/túnel confiável. Não habilite a flag apenas para contornar a proteção em uma LAN HTTP.

### Verificações automatizadas

Na raiz: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build` e `corepack pnpm --filter @aerobot/controller build:web`. Os testes de pareamento usam sockets falsos; os testes HTTP usam apenas `127.0.0.1`. Incluem autenticação, confirmação obrigatória, auditoria sem QR, contexto de transporte, idempotência, expiração/rotação, logout e persistência/validação de papéis. O teste real do WhatsApp é manual e exige a conta de teste.

## Identidade visual

O sistema AERO, tokens, fontes locais e componentes estão documentados em [DESIGN.md](DESIGN.md).

## Ambiente offline de verificação

Quando as dependências instaladas forem reutilizadas por links para uma árvore externa ao worktree, Metro precisa vê-la: configure `AEROBOT_METRO_DEPENDENCY_ROOT` com a raiz dessa árvore somente no terminal de build/web. Uma instalação local normal não precisa dessa variável. A opção não muda o protocolo nem as fontes do app.
