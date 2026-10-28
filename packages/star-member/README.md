# @aerobot/star-member

Membro Estrela mensal (mês civil America/Sao_Paulo). Pesos padrão: atividade 30,
partidas 20, rising 25, comunidade 15 e fairplay 10. Configure weights (inteiros,
soma 100), threshold (padrão 50) e excludePreviousWinner (padrão true) ao criar
StarMember. Injete repository, members (com list), clock e, para testes,
randomBytes(size). Core não depende deste pacote.

Lançamentos exigem justificativa, ator e pontos inteiros não nulos; evidência é
opcional. Correções são lançamentos negativos, respeitando 0..máximo por categoria.
Somente active/inactive participam. Fechamento congela nomes, pontos, elegíveis e
mérito. Empates de total ficam pendentes: atividade > rising > fairplay > partidas
é apenas sugestão, nunca decisão automática. resolveTie registra ator/justificativa.
revise exige autor, justificativa e contestação; gera nova versão sem apagar a
anterior. Use compensações; versões anteriores continuam auditáveis.

Sorteio separado do mérito: lista ordenada de Aero IDs únicos, uma entrada por
pessoa, seed de 32 bytes criptográficos, sha256-rejection-v1. Hash de texto UTF-8
seed hexadecimal + ":" + contador decimal iniciado em zero; primeiros 32 bits big
endian, rejeitando valores fora do maior múltiplo do tamanho da lista abaixo de
2^32. verifyRaffle reproduz a escolha, valida formato/lista e confere o checksum SHA-256 do registro imutável. Isto verifica o
procedimento registrado, não prova que o operador não escolheu outra seed antes
do registro. Produção deve usar o gerador padrão node:crypto.randomBytes.
O vencedor registrado anterior (mesmo pendente) é excluído; lista vazia falha. Sorteio nasce pendente,
approve registra ADM e publica. Uma versão tem um sorteio; revisão posterior à
extração impede aprovação de snapshot ultrapassado; registre novo sorteio na nova versão. Resultado já publicado
continua vinculado à versão original, mesmo havendo revisão.

Use InMemoryStarRepository ou SqliteStarRepository(DatabaseSync | caminho).
Conexão recebida pertence ao host; close só fecha conexão criada pelo pacote.
Tabelas star_, migração star_schema_version e triggers protegem lançamentos,
snapshots, sorteios e aprovações. Banco e snapshots contêm Aero IDs, nunca precisam
de identificadores WhatsApp para participantes; ator é o identificador fornecido
pelo host. Não exponha o banco nem o registro técnico do sorteio aos membros.

Integração:
```ts
const { memberCommands, adminCommands } = createStarCommands(service);
const bot = createBot({ ...deps, extraCommands: [...memberCommands, ...adminCommands] });
```
A autorização é **por rota**, sem verificação de cargo no comando. O host DEVE
permitir adminCommands SOMENTE na rota do grupo de administração; nunca no CHAT.
Também são exportadas as fábricas memberCommands(service), adminCommands(service)
e adminCommandNames. Respostas de membros mostram apenas os próprios pontos e
vencedores fechados/publicados por nome. publicRanking retorna só nome e total.
As operações administrativas/revisões são APIs do pacote, sem publicação externa
automática. Metas e prêmios permanecem responsabilidade da administração.
