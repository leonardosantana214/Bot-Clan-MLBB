import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;

const Id = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const GroupModulesSchema = z.object({
  welcome: z.boolean(), xpSystem: z.boolean(), mlbbCommands: z.boolean(), antiSpam: z.boolean(), scrimAlerts: z.boolean()
}).strict();
export const GroupModulesPatchSchema = GroupModulesSchema.partial().refine(v => Object.keys(v).length > 0, 'empty patch');
export const RankingPeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'all_time']);
export const ExportDatasetSchema = z.enum(['xp_ranking', 'clan_members', 'command_logs', 'moderation_audit']);
export const HostStatusSchema = z.enum(['online', 'degraded', 'offline']);

const base = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  requestId: Id,
  /** Epoch ms after which the Host must refuse to execute the request. */
  expiresAt: z.number().int().positive(),
  /** Client/origin identifier (used for login throttling). Untrusted. */
  origin: z.string().min(1).max(128).optional(),
  token: z.string().min(1).max(512).optional()
};
const empty = z.object({}).strict();

export const MUTATING_TYPES = ['setResponsesPaused', 'setMaintenanceMode', 'setGroupModules', 'requestExport'] as const;
export type MutatingType = (typeof MUTATING_TYPES)[number];
export function isMutating(type: string): type is MutatingType { return (MUTATING_TYPES as readonly string[]).includes(type); }

export const ControlRequestSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('login'), payload: z.object({ password: z.string().min(1).max(1024) }).strict() }),
  z.object({ ...base, type: z.literal('logout'), payload: z.object({ all: z.boolean().optional() }).strict() }),
  z.object({ ...base, type: z.literal('renewSession'), payload: empty }),
  z.object({ ...base, type: z.literal('getOverview'), payload: empty }),
  z.object({ ...base, type: z.literal('getHostState'), payload: empty }),
  z.object({ ...base, type: z.literal('listGroups'), payload: empty }),
  z.object({ ...base, type: z.literal('getRanking'), payload: z.object({ period: RankingPeriodSchema }).strict() }),
  z.object({ ...base, type: z.literal('setResponsesPaused'), idempotencyKey: Id, payload: z.object({ paused: z.boolean() }).strict() }),
  z.object({ ...base, type: z.literal('setMaintenanceMode'), idempotencyKey: Id, payload: z.object({ enabled: z.boolean() }).strict() }),
  z.object({ ...base, type: z.literal('setGroupModules'), idempotencyKey: Id, payload: z.object({ groupId: z.string().min(1).max(128), modules: GroupModulesPatchSchema }).strict() }),
  z.object({ ...base, type: z.literal('requestExport'), idempotencyKey: Id, payload: z.object({ dataset: ExportDatasetSchema }).strict() })
]);
export type ControlRequest = z.infer<typeof ControlRequestSchema>;
export type ControlRequestType = ControlRequest['type'];

// ---- response data ----
export const OverviewSchema = z.object({
  totalMembers: z.number().int().nonnegative(), activeToday: z.number().int().nonnegative(), messagesToday: z.number().int().nonnegative(),
  hostStatus: HostStatusSchema, clanName: z.string(), seasonLabel: z.string()
});
export const HostStateSchema = z.object({
  status: HostStatusSchema, instanceAlias: z.string(), lastConnectedAt: z.string(), uptimeLabel: z.string(),
  pendingQueueCount: z.number().int().nonnegative(), processedPerMinute: z.number().nonnegative(),
  responsesPaused: z.boolean(), maintenanceMode: z.boolean()
});
export const GroupRouteSchema = z.object({
  id: z.string(), name: z.string(), routeTag: z.string(), memberCount: z.number().int().nonnegative(),
  dailyMessages: z.number().int().nonnegative(), modules: GroupModulesSchema
});
export const RankEntrySchema = z.object({
  rank: z.number().int().positive(), memberId: z.string(), nickname: z.string(), level: z.number().int().nonnegative(),
  xp: z.number().int(), messagesSent: z.number().int().nonnegative()
});
export const ExportReceiptSchema = z.object({
  dataset: ExportDatasetSchema, fileName: z.string(), rowCount: z.number().int().nonnegative(),
  generatedAt: z.string(), previewCsv: z.string().max(8192)
});
export const LoginResultSchema = z.object({ token: z.string(), sessionId: z.string(), expiresAt: z.number().int() });
export const SessionInfoSchema = z.object({ sessionId: z.string(), expiresAt: z.number().int() });
export const LogoutResultSchema = z.object({ revoked: z.number().int().nonnegative() });

export const ERROR_CODES = [
  'invalid_request', 'unsupported_version', 'unauthenticated', 'invalid_credentials', 'rate_limited',
  'expired', 'conflict', 'not_found', 'renewal_limit', 'unsupported', 'internal'
] as const;
export type ControlErrorCode = (typeof ERROR_CODES)[number];
export const ControlErrorSchema = z.object({
  code: z.enum(ERROR_CODES), message: z.string().max(200), retryAfterMs: z.number().int().nonnegative().optional()
});
export type ControlErrorBody = z.infer<typeof ControlErrorSchema>;

export const COMMAND_STATES = ['pendente', 'recebido', 'em_execucao', 'concluido', 'falhou', 'expirou', 'cancelado'] as const;
export type CommandState = (typeof COMMAND_STATES)[number];

const respBase = { schemaVersion: z.literal(SCHEMA_VERSION), requestId: z.string() };
const cmdInfo = z.object({ id: z.string(), state: z.enum(COMMAND_STATES) });
export const ControlResponseSchema = z.union([
  z.object({ ...respBase, ok: z.literal(true), data: z.unknown(), command: cmdInfo.optional(), replayed: z.boolean().optional() }),
  z.object({ ...respBase, ok: z.literal(false), error: ControlErrorSchema, command: cmdInfo.optional(), replayed: z.boolean().optional() })
]);
export type ControlResponse = z.infer<typeof ControlResponseSchema>;

export type Overview = z.infer<typeof OverviewSchema>;
export type HostState = z.infer<typeof HostStateSchema>;
export type GroupModules = z.infer<typeof GroupModulesSchema>;
export type GroupModulesPatch = z.infer<typeof GroupModulesPatchSchema>;
export type GroupRoute = z.infer<typeof GroupRouteSchema>;
export type RankEntry = z.infer<typeof RankEntrySchema>;
export type RankingPeriod = z.infer<typeof RankingPeriodSchema>;
export type ExportDataset = z.infer<typeof ExportDatasetSchema>;
export type ExportReceipt = z.infer<typeof ExportReceiptSchema>;
