# @aerobot/exports

Collect and organize community data for Power BI/Excel. No personal MLBB statistics.

```ts
import { exportCsv, SqliteExportSource } from '@aerobot/exports';
await exportCsv(new SqliteExportSource('/data/bot.sqlite'), {
  outputFolder: '/data/csv', separator: ';',
  period: { start: '2026-10-01', endExclusive: '2026-11-01' }
});
```

Default folder: `~/.aerobot/exports` (outside the repository). `.aerobot/` and root `/exports/` are ignored. Configure another external folder for production. Core has no enumeration ports: `ExportSource` supplies a snapshot of core types; `repositorySource` combines a member listing capability, core XpLedger, and audit listing capability. It enumerates ledger entries for listed members only; the SQLite adapter includes all ledger entries and reads storage schema v1 in one transaction without migrating or writing the database.

Files: `members_v1.csv`, `xp_transactions_v1.csv`, `audit_log_v1.csv`, `rankings_v1.csv`. `HEADERS_V1` defines stable headers; every row has schema_version=1. Dates use ISO 8601 with the historical America/Sao_Paulo offset. Rankings sum XP deltas within inclusive/exclusive local day boundaries; descending XP, member ID tie break, sequential ranks; only members with transactions appear. Other files export the complete snapshot.

UTF-8 BOM, CRLF, comma default or semicolon for pt-BR Excel. Quotes/newlines are escaped; cells beginning with `= + - @`, tab or CR receive an apostrophe, while finite numeric values retain their numeric sign. WhatsApp identities are masked by default; `fullWhatsAppIdentifiers: true` explicitly includes them. Masking is not anonymization: IDs and free text in audit/XP can still be sensitive. Use a restricted folder. Each file is replaced atomically via a unique temporary sibling and rename, with cleanup on failure. The four files are not a single atomic batch; refresh consumers after export completes. Do not run concurrent exports to the same folder.

Power BI: **Get data > Folder**, select the output folder, then **Transform Data**. Filter by one filename before combining (the four tables have different schemas); create one query per file/table, set UTF-8, delimiter, and data types, then refresh after exports.

Excel: **Data > Get Data > From File > From Text/CSV** for each file (or **From Folder** in Power Query), select UTF-8 and comma/semicolon; load tables and refresh. Use a Folder query filtered by filename for repeatable imports.

## Controller: modelo analítico v1

O Host gera a pasta em `AEROBOT_EXPORT_DIR` ou `<sessão>/exports`. A resposta autenticada contém apenas nomes, linhas e prévia limitada; nunca caminhos. Reexportar substitui os arquivos. Não atualizar o Power BI durante a geração. O Host serializa suas exportações; processos externos precisam coordenar o acesso à mesma pasta.

| Dataset | Papel / chave | Campos e tipos principais |
| --- | --- | --- |
| members_v1 | dimensão membro; member_id único | schema_version inteiro, member_id texto, name/status texto, registered_at datetimezone, whatsapp_identifiers texto mascarado |
| xp_transactions_v1 | fato XP; transaction_id único, FK member_id | amount inteiro assinado, occurred_at datetimezone, source texto; source_id/actor_id/reason vazios na exportação do Controller |
| rankings_v1 | fato agregado; período + member_id | period_start/end_exclusive data, rank inteiro, xp inteiro; FK member_id |
| warnings_v1 | fato advertência; warning_id único, FK member_id | schema_version inteiro, at epoch ms inteiro; justificativa e autor não exportados |
| star_scores_v1 | fato pontos; período + membro + categoria + instante | period texto AAAA-MM, member_id FK, category texto, points inteiro assinado, at epoch ms |
| scout_v1 | dimensão candidato; candidate_id único | name/status/roles/rank/stage texto, evaluation objeto JSON de critérios com números de 0 a 10 |
| audit_log_v1 | auditoria (vazia no pacote analítico do Controller) | esquema estável existente; exportação administrativa separada disponível |

Crie `DimData` no Power Query/DAX (uma linha por data local), relacione 1:N com a data derivada de occurred_at e at. `members_v1.member_id` liga 1:N aos fatos XP, ranking, advertências e Star Member, com filtro em direção única. Scout é uma dimensão independente: não há associação automática a membros. Expanda `evaluation` no Power Query em candidate_id/critério/nota para análise por critério. Não associe Scout por nome.

Chaves de membros do Controller são `m_` + 24 caracteres hex de SHA-256 do ID interno, iguais em todos os arquivos. Isso é pseudonimização; nomes continuam presentes. Não usar nome como chave. A API genérica `exportCsv` preserva os IDs internos por compatibilidade: o Host projeta chaves e remove texto privado antes de chamá-la. CSV mantém proteção contra fórmulas e BOM UTF-8. Não exporta IDs MLBB/servidores nem notas Scout.

Os limites de ranking são dias locais (São Paulo), início inclusivo e fim exclusivo. Os outros arquivos contêm o histórico completo e são filtrados no modelo BI. XP não possui dimensão de grupo confiável: não inventamos relacionamento de XP com grupos. Contagens de recebidos ficam em control_daily por grupo/dia, sem conteúdo; não são entradas de XP.

`level_ups_v1.csv` permanece indisponível neste worktree: integrar uma fonte tipada para `level_events`, quando o contrato da outra tarefa estiver disponível. O Host já oferece a porta opcional LevelEventsPort (list por intervalo), sem consultar ou migrar tabelas de core. O futuro fato deve ter event_id único, member_id FK, occurred_at datetimezone, previous_level/new_level inteiros. Nenhuma linha fictícia é gerada.
