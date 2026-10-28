import { noArguments, type Clock, type CommandDefinition } from '@aerobot/core';
import { createBackup, defaultBackupDir, listBackups, systemClock, type RotationPolicy } from './backup.js';

export const STALE_BACKUP_HOURS = 36;

export interface MaintenanceConfig {
  dbPath: string;
  backupDir?: string;
  /** Called per backup so the secret is read from the environment and never kept in this config. */
  getPassphrase?: () => string | undefined;
  rotation?: RotationPolicy;
  clock?: Clock;
  /** Optional extra guard; the primary guard is registering these commands only on the admin route. */
  allowedSenderIds?: readonly string[];
  /** Sink for non-sensitive diagnostics (never receives paths or secrets). */
  log?: (message: string) => void;
}

const BRT_FORMAT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const formatBrt = (ms: number): string => BRT_FORMAT.format(new Date(ms)).replace(',', '') + ' (BRT)';
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
export function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} dias`;
}

export function createAdminCommands(getConfig: () => MaintenanceConfig | undefined): readonly CommandDefinition[] {
  let running = false;
  const guard = (sender: string): string | undefined => {
    const config = getConfig();
    if (!config) return 'Manutenção não configurada neste servidor.';
    if (config.allowedSenderIds && !config.allowedSenderIds.includes(sender)) return 'Comando restrito à administração.';
    return undefined;
  };
  const backup: CommandDefinition = {
    name: 'backup',
    description: 'Cria um backup verificado do banco de dados (somente administração).',
    input: noArguments,
    async handle(context) {
      const denied = guard(context.message.senderId);
      if (denied) return denied;
      const config = getConfig()!;
      if (running) return 'Já existe um backup em andamento.';
      running = true;
      try {
        const clock = config.clock ?? context.clock;
        const result = await createBackup({
          dbPath: config.dbPath, clock, rotation: config.rotation ?? {},
          ...(config.backupDir ? { backupDir: config.backupDir } : {}),
          passphrase: config.getPassphrase?.(),
          ...(config.log ? { log: config.log } : {})
        });
        const short = result.manifest.sha256.slice(0, 8);
        await context.audit.record({ action: 'backup.create', actorId: context.message.senderId, at: clock.now(), subjectId: `backup:${short}` });
        return `Backup concluído: ${formatSize(result.manifest.sizeBytes)}, hash ${short}, ${formatBrt(result.manifest.createdAt)}${result.manifest.encrypted ? ', criptografado' : ', SEM criptografia'}.`;
      } catch (error) {
        config.log?.(`backup failed: ${error instanceof Error ? error.name : 'unknown error'}`);
        return 'Falha ao criar o backup. Consulte os logs do servidor.';
      } finally { running = false; }
    }
  };
  const statusbackup: CommandDefinition = {
    name: 'statusbackup',
    description: 'Mostra o último backup, sua idade e avisa se estiver desatualizado (somente administração).',
    input: noArguments,
    async handle(context) {
      const denied = guard(context.message.senderId);
      if (denied) return denied;
      const config = getConfig()!;
      const [latest] = await listBackups(config.backupDir ?? defaultBackupDir());
      if (!latest) return 'ATENÇÃO: nenhum backup encontrado.';
      const age = (config.clock ?? context.clock ?? systemClock).now() - latest.manifest.createdAt;
      const line = `Último backup: ${formatBrt(latest.manifest.createdAt)}, há ${formatAge(age)}, ${formatSize(latest.manifest.sizeBytes)}, hash ${latest.manifest.sha256.slice(0, 8)}${latest.manifest.encrypted ? ', criptografado' : ', SEM criptografia'}.`;
      return age > STALE_BACKUP_HOURS * 3_600_000 ? `${line}\nATENÇÃO: backup com mais de ${STALE_BACKUP_HOURS} h. Execute /backup.` : line;
    }
  };
  return [backup, statusbackup];
}

let current: MaintenanceConfig | undefined;
/** The host calls this once at startup; until then the commands answer "not configured". */
export function configureMaintenance(config: MaintenanceConfig | undefined): void { current = config; }
/** Register ONLY on the administration route (route allow-list is the access control). */
export const adminCommands: readonly CommandDefinition[] = createAdminCommands(() => current);
