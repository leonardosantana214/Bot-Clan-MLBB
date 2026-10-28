# @aerobot/community

Gestão de comunidade para o bot AERO: entradas/saídas, notificações aos ADMs, boas-vindas e moderação assistida. O core não importa este pacote; o host faz a ligação.

```ts
const community = createCommunity({ config, store, adapter, members, clock });
community.attach(observableAdapter);          // onMembershipChange + onMessage
setInterval(() => void community.tick(), 15_000); // fecha janelas de agregação, envia fila e boas-vindas
createBot({ ..., extraCommands: [...community.memberCommands, ...community.adminCommands] });
```

## Regras

- **Entrada/saída (BR-03, RF-04)**: cada evento vira `MembershipEvent` append-only. Nada apaga perfil nem muda status. Só abre um *caso de revisão* quando há evidência de saída (`leave`) em **todos** os grupos visíveis (`visibleGroupIds`, padrão = CHAT + administração); grupo sem evidência conta como "não saiu". Use `observePresence` para semear presença. Participante sem cadastro que entra gera "pendente de cadastro".
- **Notificações (RF-15, BR-18)**: `registered -> queued -> sent -> confirmed | failed`. Idempotência por (evento, destino), agregação por tipo numa janela (`notifications.windowMs`, 10 min), retry limitado com backoff. Destino é sempre `adminGroupId`; a configuração rejeita um grupo de administração que também seja CHAT. `sendMessage` resolvido é tratado como confirmação (`autoConfirm`); desligue-o e use `confirm(id)` se houver ack real. O buffer de agregação é em memória (perdido num crash; os ledgers mantêm os fatos).
- **Boas-vindas**: DESLIGADAS por padrão, por grupo CHAT (`welcome[groupId].enabled`). Template pt-BR com `{nomes}`, `{quantidade}`, `{grupo}` (outros placeholders são rejeitados). Entradas em rajada são agregadas e há intervalo mínimo entre mensagens. Nomes são sanitizados; nunca aparece telefone/JID.
- **Moderação assistida (RF-10)**: flood, mensagens repetidas (hash curto em memória, janela e limite) e links suspeitos (`links.suspiciousDomains`; encurtadores e convites de grupo por padrão). Apenas gera `ModerationFlag` e notifica ADMs; não bloqueia, remove nem pune. Texto de mensagem nunca é armazenado.
- **Advertências**: ledger append-only. `adminCommands` (`/advertir <aeroId> <motivo...>`, `/advertencias <aeroId>`) devem ser registrados **somente** na rota do grupo de administração (a autorização do core é por rota: quem escreve ali é ADM); os comandos também recusam executar fora de `adminGroupId`. `memberCommands` (`/minhasadvertencias`) podem ir às rotas CHAT. Respostas mostram apenas nome e motivo, sem identificador de WhatsApp.

## Persistência

`InMemoryCommunityStore` e `SqliteCommunityStore(DatabaseSync | caminho)`. Tabelas `comm_*` com `comm_schema_version` própria; triggers bloqueiam UPDATE/DELETE em `comm_membership_event`, `comm_moderation_flag` e `comm_warning`.
