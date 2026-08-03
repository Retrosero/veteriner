/**
 * @file Log retention domain tipleri.
 * @module apps/api/common/logging/log-retention.types
 *
 * @description GOAL-106 (FAZ-10) PII maskeleme ve log retention
 * için iç kayıt tipleri. Hızlı sorgu için bellek indeksinde tutulur ve
 * Prisma `LogRetentionPolicy` ile `LogRetentionSweep` tablolarına
 * kalıcı olarak yansıtılır (API sözleşmesi sabit kalır).
 *
 * `RetentionPolicyRecord` ile `RetentionPolicy` ayrılmıştır:
 * record repository içi tam yapı (createdById/createdAt/updatedById/
 * updatedAt dahil) iken `RetentionPolicy` API'ye dönen public
 * shape'tir.
 *
 * `RetentionSweepRecord` ise tarama sonuçlarının append-only
 * geçmişidir; PII içermez (sadece sayım).
 *
 * @security Policy her zaman `redactPii=true` ile başlar; service
 *   bu alanın caller tarafından kapatılmasına izin vermez. Tüm
 *   sweep adımları arşivlenecek payload üzerinde `PiiMasker`
 *   çalıştırır; mask'lı olmayan payload arşive yazılmaz.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import type {
  ArchiveStorage,
  LogRetentionSeverity,
  LogType,
  RetentionPolicy,
  RetentionPolicyUpsert,
  RetentionSweepBucket,
  RetentionSweepResult,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Persist edilmiş kayıtlar
 * --------------------------------------------------------------------------
 */

/** Repository içi tam policy kaydı. */
export interface RetentionPolicyRecord {
  id: string;
  tenantId: string | null;
  logType: LogType;
  severity: LogRetentionSeverity;
  retentionDays: number;
  archiveAfterDays: number;
  archiveStorage: ArchiveStorage;
  redactPii: boolean;
  createdById: string;
  createdAt: string;
  updatedById: string;
  updatedAt: string;
}

/** Sweep geçmişi kaydı (append-only). */
export interface RetentionSweepRecord {
  id: string;
  triggeredBy: RetentionSweepResult["triggeredBy"];
  startedAt: string;
  finishedAt: string;
  totalScanned: number;
  totalArchived: number;
  totalDeleted: number;
  totalErrors: number;
  buckets: RetentionSweepBucket[];
  dryRun: boolean;
  note: string | null;
  /** Sweep'i tetikleyen aktörün userId'si. */
  triggeredById: string | null;
}

/* --------------------------------------------------------------------------
 * Record → public dönüşüm
 * --------------------------------------------------------------------------
 */

export function toRetentionPolicy(rec: RetentionPolicyRecord): RetentionPolicy {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    logType: rec.logType,
    severity: rec.severity,
    retentionDays: rec.retentionDays,
    archiveAfterDays: rec.archiveAfterDays,
    archiveStorage: rec.archiveStorage,
    redactPii: rec.redactPii,
    createdById: rec.createdById,
    createdAt: rec.createdAt,
    updatedById: rec.updatedById,
    updatedAt: rec.updatedAt,
  };
}

export function toRetentionSweepResult(
  rec: RetentionSweepRecord,
): RetentionSweepResult {
  return {
    sweepId: rec.id,
    triggeredBy: rec.triggeredBy,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
    totalScanned: rec.totalScanned,
    totalArchived: rec.totalArchived,
    totalDeleted: rec.totalDeleted,
    totalErrors: rec.totalErrors,
    buckets: rec.buckets,
    dryRun: rec.dryRun,
  };
}

/* --------------------------------------------------------------------------
 * Effective policy çözümleme
 * --------------------------------------------------------------------------
 */

/**
 * Tenant'a uygulanacak effective policy. Öncelik sırası:
 * 1. Tenant-specific override (tenantId ile eşleşen).
 * 2. Global override (tenantId=null).
 * 3. Hard-coded default (DEFAULT_* tabloları).
 */
export interface EffectivePolicy {
  retentionDays: number;
  archiveAfterDays: number;
  archiveStorage: ArchiveStorage;
  redactPii: boolean;
  /** Hangi kaynaktan geldi? Debug/UI için. */
  source: "tenant_override" | "global_override" | "default";
}

/** Upsert input'undan effective policy çözümlemek için kullanılan
 *  yardımcı type (sadece okuma). */
export type RetentionPolicyKey = {
  tenantId: string | null;
  logType: LogType;
  severity: LogRetentionSeverity;
};

/** Upsert input type'ı repo tarafında tekrar export. */
export type RetentionPolicyCreate = RetentionPolicyUpsert;
