# Fronteiras de módulos

Monorepo proposto (simplificado em relação ao prompt; **Proposta / Pendente**):

```
aero-basta/
  apps/host/            # RN Android (painel do Host) — após PoC
  apps/controller/      # RN Android+iOS
  packages/domain/      # entidades, regras puras (zero deps externas)
  packages/application/ # casos de uso, portas (interfaces)
  packages/contracts/   # tipos + schemas (zod) compartilhados
  packages/design-system/
  packages/engine/      # composição: registro de comandos, scheduler, wiring
  adapters/whatsapp-baileys/  adapters/mlbb-*/  adapters/storage-sqlite/  adapters/sync-supabase/
  docs/ tests/ scripts/ .github/
```

Simplificação justificada: `shared-types` + `validation` + `configuration` viram `contracts`; `services/sync-api` não existe (Supabase cobre); `integrations/` vira `adapters/`.

## Regra de dependência

`domain ← application ← engine ← apps/adapters`. Nada em `domain`/`application` importa Baileys, React Native, Supabase ou SQLite (verificar com lint de fronteiras na Etapa 1).

## Portas (em `application`)

WhatsAppAdapter · MLBBProvider · MemberRepository · ActivityRepository · ScoringService · NotificationGateway · AuditRepository · MediaProvider · StorageProvider · Scheduler · AuthenticationProvider · Clock · IdGenerator.

## Contrato mínimo de comando

```ts
interface CommandDefinition<I> {
  name: string; aliases?: string[];
  input: ZodSchema<I>;
  requires: { role: Role; modules?: ModuleId[]; routes?: GroupRole[] };
  rateLimit: { perUser: Window; perGroup?: Window };
  audit: boolean;
  handle(ctx: CommandContext, input: I): Promise<CommandResult>;
}
```

Cada comando é um arquivo/módulo registrado; nenhum switch gigante.

## Roteamento de grupos

`GroupRouteRegistry` mapeia `platformGroupId → { role, modules, allowedCommands, moderation, notifications, reportPrefs }`. Nome visível nunca é chave. Alteração via Controller gera auditoria.
