# AERO — sistema visual

Identidade de administração do clã AERO: preto quente, carmesim contido e champagne. A composição usa espaço negativo, títulos editoriais e filetes; não usa sombras, gradientes decorativos ou emojis.

## Tokens e paleta

Fonte de verdade: `src/theme/tokens.ts`, exportada por `src/theme/index.ts`. Não adicionar cores literais às telas. Metadados do Expo, manifest, HTML inicial e arquivos de imagem precisam repetir as cores estáticas, pois são usados antes do JavaScript.

| Papel | Valor | Uso |
| --- | --- | --- |
| Fundo | `#08080A` | Canvas e carregamento inicial |
| Superfície | `#101013` | Seções |
| Superfície elevada | `#16161A` | Diálogos e controles |
| Destaque de superfície | `#1D191B` | Hover |
| Carmesim | `#B3122B` | Ação primária, destrutiva e seleção |
| Carmesim intenso | `#D2132F` | Reserva para interação |
| Ouro envelhecido | `#C9A24B` | Monograma, números e cantos do QR |
| Champagne | `#E3C77A` | Rótulos e destaques legíveis |
| Marfim | `#EDE6D6` | Texto principal e texto sobre carmesim |
| Cinza quente | `#BDB6AA` | Texto secundário |
| Cinza discreto | `#A39B8E` | Metadados e placeholders |
| Verde dessaturado | `#A9BE9B` | Texto de sucesso; indicador `#718768` |
| Âmbar | `#E3C77A` | Avisos; indicador `#C9A24B` |
| Vermelho dessaturado | `#E99BA6` | Texto de erro |
| Prata / bronze | `#B7B4AA` / `#B58F72` | Segundo e terceiro lugares |

Bordas: 1 px, ouro com 30% de opacidade (35% no destaque). Não usar a borda translúcida como cor de texto. Branco puro é reservado ao fundo do QR para preservar sua leitura; o QR continua gerado localmente, sem mudança de conteúdo ou validade.

As cores de texto sobre as superfícies escuras e o marfim sobre o botão primário atendem à razão mínima AA de 4,5:1. Indicadores de estado acompanham rótulos, sem depender somente de cor. Bordas decorativas não substituem o foco explícito.

## Tipografia

- **Cormorant Garamond 500**: marca, títulos de seção, posições e números grandes.
- **Manrope 400 / 500 / 600**: conteúdo, controles, rótulos e metadados.
- Pacotes `@expo-google-fonts/cormorant-garamond@0.4.1` e `@expo-google-fonts/manrope@0.4.1`; arquivos TTF locais, licença OFL-1.1, com os avisos nas distribuições npm (`LICENSE_FONT`). Imports por peso evitam exportar toda a família. Nenhuma fonte é buscada de CDN em runtime.
- Escala base: 12 / 14 / 16 / 18 / 22 / 28 px; títulos editoriais 24–38 px; métricas 40 px; marca de login 58 px. Navegação compacta 11 px e microrrótulos 10–12 px.
- Entrelinha base: 16 / 20 / 24 / 26 / 30 / 36 px. Microrrótulos em caixa alta com 2 px de espaçamento; wordmark com 8 px. Métricas usam `tabular-nums`.
- A aplicação mostra fundo preto com monograma e marca enquanto as fontes carregam. Se o carregamento falhar, a plataforma pode usar fonte de fallback para manter o acesso ao painel.

## Forma, espaço e composição

Escala de espaço: 4 / 8 / 12 / 16 / 20 / 24 / 32 px. Raios: 2 / 4 / 6 px. Sem pílulas. Coluna principal de até 540 px, centralizada no desktop e fluida no celular. Login de até 420 px com rolagem para alturas pequenas e teclado aberto. Conteúdo rolável entre cabeçalho e navegação fixa. Elementos de cabeçalho e linhas longas podem quebrar linha.

## Identidade e componentes

- `AeroMark`: monograma SVG original em grade 64 × 64. Ápice aberto, asa dividida e barra horizontal sugerem um A aerodinâmico. Props `size` e `color`.
- `AeroWordmark`: AERO em serifa espaçada, com `size` e `color`. Reutilizado no hero e cabeçalho.
- `AeroIcon`: ícones SVG de traço 1,35 px, sem glifos de emoji. Uso na navegação e nos estados vazio/erro.
- Assets: `assets/aero-mark.svg`, `assets/icon.png`, `public/favicon.svg` e ícones PNG de 192/512 px. Desenhados por código a partir do mesmo monograma; sem imagens baixadas. O manifest é ligado pelo HTML público e não adiciona service worker nem muda a política de cache.
- `Button`: primário carmesim com filete dourado e texto marfim; secundário/outline com borda dourada; destrutivo em contorno discreto e texto vermelho dessaturado. Alvos de toque mínimos de 44 × 44 px. Foco claro, hover, pressed e disabled explícitos. Carregamento textual estático, mantendo bloqueio e semântica de busy existentes.
- `AeroPressable`: estados visuais compartilhados da navegação e dos seletores de demonstração; sem alterar handlers de ação. Alvo mínimo de 44 px.
- `AeroInput`: campo escuro com borda dourada em foco, placeholder quente e estado não editável. Encaminha os handlers existentes, inclusive salvamento no blur.
- `Card`: superfície sóbria, filete fino, título serifado e cabeçalho adaptável. `ListItem`: hierarquia em sans com separador inferior, evitando caixas dentro de caixas.
- `Badge`: compacto, quase reto, com estado escrito. Demonstração usa selo dourado discreto.
- `EmptyState`, `ErrorState`, `Loading`: marca/ícones finos e mensagens legíveis; ações existentes preservadas.
- `ConfirmModal`: fundo preto translúcido, superfície elevada e confirmação existente. Sem animação.

## Telas e estados

Login com hero centralizado; visão geral com números dourados; conexão com QR em moldura de ouro e cantos de viewfinder, incluindo estado de espera estático; grupos com títulos editoriais e ações CHAT/ADM; ranking com numerais romanos I/II/III em ouro/prata/bronze e separadores finos; configurações com o mesmo sistema de campos, botões e seções.

Nenhuma animação contínua foi adicionada. Carregamento e modal são estáticos; o HTML também respeita `prefers-reduced-motion`. O conteúdo do QR, polling, autenticação, permissões, navegação, contratos e regras de negócio permanecem iguais. Apenas a marca fixa `clanName` e sua asserção foram atualizadas para AERO.

## Validação e limites

Comandos na raiz: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`; web: `corepack pnpm --filter @aerobot/controller build:web`.

A revisão visual em navegador e os screenshots não foram realizados: a ferramenta de computer-use recusou acesso ao Microsoft Edge. A compilação web e os checks automatizados não substituem a revisão manual em 360–430 px, desktop, teclado, ampliação de texto e dispositivos iOS/Android. O PWA continua com os recursos de instalação existentes, sem promessa de funcionamento offline.

## Polimento mobile

Liderança mostra dez itens por lista e permite ver mais, preservando as divisórias. A troca de seção limpa resultados e invalida respostas anteriores por identificador de requisição. Seletores são secundários; Consultar é a ação primária.
