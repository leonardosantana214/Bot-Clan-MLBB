# Host Android via Termux

Status de execução: **Não verificado**. Nenhum aparelho Android, iPhone ou WhatsApp real foi testado. A decisão de produto está confirmada no [ADR-0007](../decisions/ADR-0007-android-first.md); estabilidade e compatibilidade continuam **Não verificado**.

## 1. Preparar o celular — Não verificado

Use um Android reserva e um número **de TESTE**, nunca a conta principal do clã. Instale o Termux pelo F-Droid oficial. Nas configurações de bateria do Android, procure Termux e escolha “Sem restrições”/“Não otimizar”. Permita execução em segundo plano. Os nomes variam por fabricante. Mantenha Wi-Fi estável e acompanhe temperatura e bateria.

O Android ainda pode matar o processo, mesmo com wake lock. O script só reinicia o Node enquanto o Termux permanece vivo; após reiniciar o aparelho, abra o Termux e inicie o Host manualmente.

## 2. Instalar — Não verificado

No Termux, execute:

```sh
pkg update -y
pkg install -y nodejs git
node -v
```

É necessário Node 22 com `node:sqlite`; o monorepo declara Node >=22 e <23. Se receber versão menor que 22, pare e atualize o ambiente. Se receber versão maior, a compatibilidade está **Não verificado**: prefira Node 22. Corepack precisa estar disponível; se `corepack` não existir no pacote do Termux, a instalação está pendente de validação nesse aparelho. Não ignore erros.

Clone a URL pública do projeto (copie a URL do botão Code do repositório):

```sh
# Substitua URL_PUBLICA pela URL pública, sem credenciais.
git clone URL_PUBLICA "$HOME/Bot-Clan-MLBB"
cd "$HOME/Bot-Clan-MLBB"
sh scripts/termux/install.sh
```

O instalador atualiza com `pull --ff-only`, ativa Corepack, instala com lockfile congelado e compila. Alternativamente, execute o instalador obtido do projeto com `AEROBOT_REPO_URL` e `AEROBOT_REPO_DIR`; ele clona se o destino ainda não existir. Falha de download, Corepack, Node ou build interrompe a instalação.

## 3. Criar a senha privada — Não verificado

A pasta de sessão e a senha ficam **fora do repositório**, no armazenamento privado do Termux. Não use armazenamento compartilhado do Android, não publique a pasta, QR, senha, logs pessoais ou backups.

```sh
umask 077
mkdir -p "$HOME/aerobot-sessao"
chmod 700 "$HOME/aerobot-sessao"
# Digite uma senha nova e privada, sem exibi-la no terminal.
trap 'stty echo' INT TERM 0
stty -echo
IFS= read -r senha
stty echo
printf '\n'
printf '%s' "$senha" > "$HOME/aerobot-sessao/senha-admin.txt"
unset senha
trap - INT TERM 0
chmod 600 "$HOME/aerobot-sessao/senha-admin.txt"
```

Não há senha pronta neste guia. Guarde sua senha em local privado. O script nunca a imprime, mas o processo Host a recebe em variável de ambiente; mantenha o aparelho protegido.

## 4. Iniciar e parear — Não verificado

```sh
cd "$HOME/Bot-Clan-MLBB"
sh scripts/termux/start-host.sh
```

Deixe essa sessão aberta. O script usa porta 8787, obtém wake lock, tenta no máximo cinco reinícios após falhas, com intervalo de dez segundos, e libera o wake lock ao sair. Ctrl+C encerra. Saída normal não provoca reinício. Se alcançar o limite, investigue e inicie manualmente.

Abra o Controller Android **nativo gerado com a configuração do projeto** no mesmo aparelho. O endereço inicial é `http://127.0.0.1:8787` e continua editável. Informe a senha criada. Em Conexão, toque “Gerar novo QR”. Use a conta de teste no WhatsApp em “Aparelhos conectados” para escanear o QR em uma tela privada: com um único aparelho, a leitura do próprio QR pode não ser viável; use uma segunda tela/dispositivo de teste sob seu controle. Esse fluxo no mesmo aparelho está **Não verificado**. Nunca envie o QR para chats.

Em Grupos, escolha CHAT e ADM de teste distintos. Reinicie o Host após mudar os papéis para compor as rotas. Se “Host inacessível” aparecer, confirme se o Termux ainda está executando e se o endereço está correto.

HTTP foi liberado na configuração Android apenas para `localhost` e `127.0.0.1`, sem subdomínios. O plugin local usa as ferramentas já incluídas no Expo; é aplicado ao gerar o projeto nativo, não muda as regras do Expo Go. APK/build nativo e aplicação efetiva da regra no aparelho: **Não verificado**. HTTP não protege dados em trânsito; mantenha a API em loopback. Não abra portas no roteador.

O Controller iOS é PWA. Loopback no iPhone aponta para o iPhone, não para o Host Android. Acesso remoto e iOS com HTTPS, certificado, origem/CORS e autenticação de implantação: **Proposta/Pendente**. Uma PWA HTTPS pode bloquear chamadas HTTP por conteúdo misto. Não anuncie esse acesso como pronto.

## 5. Medir — Não verificado

Registre apenas dados técnicos, sem números, senhas, QR ou mensagens pessoais. Durante 72 horas, anote modelo/Android/Node, hora de início, RAM, bateria/temperatura a cada 30 minutos, latência de `/ping` três vezes ao dia, reconexões e mortes de processo. Teste tela apagada, duas quedas de Wi-Fi e um reinício do aparelho. Confira que o Host volta ao abrir o Termux, que eventos pendentes reaparecem e que nenhuma saída muda automaticamente o status do membro.

Use a tabela e os critérios propostos na [PoC-1](POC1_TERMUX.md). Todos os resultados permanecem **Não verificado** até haver registro real. Fakes automatizados não comprovam entrega de mensagem, operação contínua, consumo de bateria ou segurança da configuração nativa.

## Verificação automatizada no desenvolvimento

Ambiente: Windows, Node 22.19.0, pnpm 9.15.9, `CI=true`; branch `feat/android-first`, base `97deae0`. Isso não altera o status **Não verificado** em aparelhos.

- Instalação com `corepack pnpm install --frozen-lockfile`: passou, lockfile preservado, dependências reutilizadas do cache.
- `corepack pnpm build`, `typecheck` e `lint`: passaram. O typecheck recompila os pacotes e inclui o Controller.
- Export web: `corepack pnpm --filter @aerobot/controller build:web` passou.
- Plugin local: teste com os mods reais do Expo confirmou referência no manifesto, bloqueio global de cleartext e XML permitindo apenas `localhost`/`127.0.0.1`, sem subdomínios. Nenhuma dependência nova.
- Scripts: sintaxe conferida com `sh -n` (Git sh). ShellCheck não está disponível; execução real no Termux continua **Não verificado**.
- O ambiente oferece Corepack sem um executável `pnpm` no PATH. Para os scripts internos do monorepo foi usado lançador temporário em `.cache/toolbin`, apontando para `corepack pnpm`, com PATH apenas dos comandos. Nenhuma configuração global foi alterada.
- Uma execução concorrida excedeu 5 s no teste existente “applies one persona frame to core, star, community and maintenance output without changing data”. Isolado, o arquivo passou (7 testes; caso em 408 ms), sem mudar timeout. Repetição completa com `corepack pnpm run test --maxWorkers=2`: **271 testes passaram em 21 arquivos**, incluindo 12 novos casos, sem aumentar timeout.

Limites intencionais: cinco reinícios por execução do script; entrada de 200 itens aguardando mais um ativo, descartando o mais antigo com contador; envio com prazo de 30 s incluindo espera na fila; drenagem/desconexão de 5 s cada e limite total de 10 s no executável. Timeout não comprova cancelamento de um envio já aceito pelo transporte. Claims órfãos da versão anterior não são reconstruídos. Cada pasta de sessão deve ter somente um Host ativo.

Commit não criado: o ambiente negou escrita em `.git/worktrees/android/index.lock` durante `git add`. Nenhuma permissão ou configuração global foi alterada; sem push/merge. Mensagem planejada:

```text
feat(android): prepara Host Termux e corrige auditoria de notificações e limites

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```
