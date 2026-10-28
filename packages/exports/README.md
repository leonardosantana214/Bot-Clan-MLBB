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

UTF-8 BOM, CRLF, comma default or semicolon for pt-BR Excel. Quotes/newlines are escaped; cells beginning with `= + - @`, tab or CR receive an apostrophe, including negative numbers (convert numeric types explicitly in Power Query). WhatsApp identities are masked by default; `fullWhatsAppIdentifiers: true` explicitly includes them. Masking is not anonymization: IDs and free text in audit/XP can still be sensitive. Use a restricted folder. Each file is replaced atomically via a unique temporary sibling and rename, with cleanup on failure. The four files are not a single atomic batch; refresh consumers after export completes. Do not run concurrent exports to the same folder.

Power BI: **Get data > Folder**, select the output folder, then **Transform Data**. Filter by one filename before combining (the four tables have different schemas); create one query per file/table, set UTF-8, delimiter, and data types, then refresh after exports.

Excel: **Data > Get Data > From File > From Text/CSV** for each file (or **From Folder** in Power Query), select UTF-8 and comma/semicolon; load tables and refresh. Use a Folder query filtered by filename for repeatable imports.
