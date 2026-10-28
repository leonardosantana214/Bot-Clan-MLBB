# Power BI Desktop e Excel

1. Conecte o Controller no modo real, autentique e abra **Mais → Liderança → Analytics**. Selecione o período e use **Gerar pasta de CSV no Host**. A tela mostra arquivos, quantidade de linhas e prévia; no navegador, use **Baixar** para copiar o CSV completo. O Host não transmite o caminho absoluto.
2. No computador do Host, a liderança configura `AEROBOT_EXPORT_DIR` antes de iniciar o processo. Sem a variável, a pasta fica dentro da sessão em `exports`. Use uma pasta privada que o Power BI consiga ler.
3. No Power BI Desktop: **Get data → Text/CSV** (Obter dados → Texto/CSV), escolha `members_v1.csv`, UTF-8 e delimitador vírgula, **Transform Data**. Repita para cada dataset.
4. Para atualização recorrente: **Get data → Folder** (Pasta). Filtre pelo nome exato de um arquivo antes de combinar. Crie uma consulta separada por dataset: seus esquemas são diferentes. Ignore arquivos `.tmp`.
5. Defina os tipos indicados em [packages/exports/README](../../packages/exports/README.md). Desative detecção automática para chaves: são texto. Converta epochs em ms dividindo por 1000 e somando à época UTC. Use a data local de São Paulo para DimData.
6. Relacione membros 1:N aos fatos por member_id. Crie DimData com relações para fatos por data. Expanda o objeto evaluation de Scout em linhas de critério/nota. Não relacione Scout por nome.
7. Atualize somente depois que o Controller responder que a exportação terminou. Cada arquivo é trocado atomicamente; o conjunto não constitui uma transação única. Se houver falha, gere novamente antes de atualizar o relatório.

No Excel: **Dados → Obter Dados → De Arquivo → De Texto/CSV** ou **De Pasta**, com as mesmas regras de tipos e relacionamentos. Nunca habilite fórmulas em células que contenham dados exportados.

O período selecionado calcula ranking; os demais arquivos oferecem histórico completo para filtros no Power Query/relatório. Identificadores WhatsApp são mascarados, chaves de membros são pseudonimizadas e texto privado de lançamentos não é exportado pelo Controller. Nomes de membros/candidatos continuam presentes. Não há estatísticas pessoais automáticas do MLBB.

Level-ups estão indisponíveis até integração tipada da tabela `level_events`. A dimensão de grupo não existe no ledger de XP atual; não aplique filtro de grupo a XP como se houvesse essa relação. A série de atividade recebida do Host é uma agregação separada por grupo/dia e inclui apenas eventos que o adapter entrega ao Host.
