/**
 * @file Backup/restore giris modulu.
 * @module @vetniva/backup
 *
 * @description GOAL-124 (FAZ-12) kapsaminda backup + restore
 * cekirdek motoru. Tenant izolasyonu, PII ve audit kurallarina
 * uyar; placeholder veri kimliksiz.
 *
 * @since GOAL-124 (FAZ-12) backup + restore
 */

export type {
  ArchiveStorage,
  BackupFrequency,
  BackupMethod,
  BackupRequest,
  BackupResult,
  BackupTier,
  RestoreTestResult,
  RpoRtoSummary,
} from "./backup-types.js";
export { RPO_RTO_TIERS, rpoRtoForTier } from "./backup-types.js";

export {
  buildBackupFileName,
  buildObjectKey,
  computeChecksum,
  defaultPgDumpRunner,
  performBackup,
  planBackup,
  retentionForTier,
} from "./backup.js";
export type {
  BackupPlan,
  ColdStorageTier,
  PerformBackupOptions,
  PgDumpRunner,
  RetentionSpec,
  UploadBackend,
  UploadTarget,
} from "./backup.js";

export {
  buildRestoreDatabaseName,
  isValidRestoreDbName,
  performRestore,
  preflightCheck,
  tierMatchesBackup,
} from "./restore.js";
export type { PreFlightCheck, RestoreOptions } from "./restore.js";

export {
  checksumFile,
  diffRowCounts,
  MIN_TABLE_COUNTS,
  verifyChecksum,
  verifyRestore,
  verifyRestoreTest,
} from "./verify.js";
export type { VerifyOptions, VerifyResult } from "./verify.js";

export {
  buildSchedule,
  DEFAULT_CRON,
  DEFAULT_WAL_CRON,
  ENV_VARS,
  isValidCron,
  nextRunTime,
  readTierFromEnv,
} from "./schedule.js";
export type { ScheduleConfig } from "./schedule.js";
