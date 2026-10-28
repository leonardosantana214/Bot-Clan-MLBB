import { z } from 'zod';

export const WELCOME_PLACEHOLDERS = ['nomes', 'quantidade', 'grupo'] as const;
export const DEFAULT_SUSPICIOUS_DOMAINS: readonly string[] = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'ow.ly', 'tiny.cc', 'chat.whatsapp.com'
];
export const DEFAULT_WELCOME_TEMPLATE = 'Bem-vindo(a) ao {grupo}, {nomes}! Use /ajuda para ver os comandos.';

const templateSchema = z.string().min(1).max(500).refine(
  t => [...t.matchAll(/\{([^}]*)\}/gu)].every(m => (WELCOME_PLACEHOLDERS as readonly string[]).includes(m[1] ?? '')),
  'Placeholder desconhecido no template'
);
const ms = z.number().int().positive();

const welcomeSchema = z.object({
  /** OFF by default: nothing is ever sent unless explicitly enabled for the group. */
  enabled: z.boolean().default(false),
  template: templateSchema.default(DEFAULT_WELCOME_TEMPLATE),
  /** Joins within this window are aggregated into a single message. */
  windowMs: ms.default(30_000),
  /** Minimum time between two welcome messages in the same group. */
  minIntervalMs: ms.default(60_000),
  maxNames: z.number().int().min(1).max(20).default(5)
});

export const communityConfigSchema = z.object({
  adminGroupId: z.string().min(1),
  chatGroupIds: z.array(z.string().min(1)).min(1),
  /** Groups the bot can see; defaults to chat groups plus the admin group. */
  visibleGroupIds: z.array(z.string().min(1)).optional(),
  groupLabels: z.record(z.string(), z.string().max(60)).default({}),
  notifications: z.object({
    windowMs: ms.default(600_000),
    maxLines: z.number().int().min(1).max(100).default(20),
    maxAttempts: z.number().int().min(1).max(10).default(3),
    retryBaseMs: ms.default(30_000),
    /** sendMessage resolving is the only delivery signal the adapter gives; treat it as confirmation. */
    autoConfirm: z.boolean().default(true)
  }).default({}),
  welcome: z.record(z.string(), welcomeSchema).default({}),
  moderation: z.object({
    flood: z.object({ maxMessages: z.number().int().min(2).default(8), windowMs: ms.default(10_000) }).default({}),
    repeat: z.object({ threshold: z.number().int().min(2).default(3), windowMs: ms.default(60_000), minLength: z.number().int().min(1).default(8) }).default({}),
    links: z.object({ suspiciousDomains: z.array(z.string().min(3)).default([...DEFAULT_SUSPICIOUS_DOMAINS]), flagAllLinks: z.boolean().default(false) }).default({}),
    cooldownMs: ms.default(60_000),
    maxTracked: z.number().int().min(10).default(2000)
  }).default({})
}).superRefine((cfg, ctx) => {
  if (cfg.chatGroupIds.includes(cfg.adminGroupId)) ctx.addIssue({ code: 'custom', message: 'adminGroupId must not be a CHAT group (BR-18)', path: ['adminGroupId'] });
  for (const id of Object.keys(cfg.welcome)) if (!cfg.chatGroupIds.includes(id)) ctx.addIssue({ code: 'custom', message: 'welcome only applies to CHAT groups', path: ['welcome', id] });
});

export type CommunityConfigInput = z.input<typeof communityConfigSchema>;
export type CommunityConfig = z.output<typeof communityConfigSchema> & { visibleGroupIds: string[] };

export function parseCommunityConfig(input: CommunityConfigInput): CommunityConfig {
  const cfg = communityConfigSchema.parse(input);
  return { ...cfg, visibleGroupIds: [...new Set(cfg.visibleGroupIds ?? [...cfg.chatGroupIds, cfg.adminGroupId])] };
}
