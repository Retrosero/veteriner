/**
 * @file Log retention sözleşmesi.
 * @module @vetniva/contracts/log-retention
 *
 * @description GOAL-106 (FAZ-10) log retention ve arşivleme
 * kuralları için API sözleşmesi. Tenant, log türü ve severity
 * bazında retention süresi + archive stratejisi tanımlanır.
 * Superadmin tarafından yönetilir; her tenant kendi policy'sini
 * override edebilir (override policy yalnız SUPERADMIN tarafından
 * set edilebilir; tenant UI tarafı FAZ-15+).
 *
 * Log türleri (`logType`):
 * - `audit_log`        : audit service kayıtları (her işlem
 *                         aksiyonunun denetim izi).
 * - `error_event`      : merkezi hata olayları (GOAL-100).
 * - `security_event`   : güvenlik olayları (GOAL-105).
 * - `job_run`          : background job + entegrasyon logları
 *                         (GOAL-102). PII riski düşük.
 * - `notification`     : gönderilen bildirim kayıtları (SMS/email
 *                         içerik; PII riski yüksek).
 * - `request_log`      : HTTP istek logları (en yüksek PII riski;
 *                         body/header sızıntısı).
 *
 * Severity:
 * - `info` | `warning` | `error` | `critical`
 * (ErrorEvent/SecurityEvent ile aynı katalog).
 *
 * Archive storage tier:
 * - `hot`  : canlı veritabanı, sık erişim.
 * - `cold` : arşiv (object storage), uzun vadeli ama geç erişim.
 * - `none` : arşivleme yok; doğrudan silinir.
 *
 * PII sanitizer bağlamı:
 * - Tüm `archiveBody` alanları arşivleme öncesi PiiMasker'dan
 *   geçer. Default davranış: payload mask'lı; `redactPii=false`
 *   override edilmemelidir (her zaman mask uygulanır).
 *
 * @security Default politikalar severity × logType matrisine göre
 *   sabit kodludur; SUPERADMIN override edebilir. KVKK / UK GDPR
 *   uyumlu default'lar seçilmiştir (yüksek PII → kısa retention).
 *   `retentionDays` minimum 7, `archiveAfterDays` >= 0 ve
 *   `retentionDays`'ten küçük olmalıdır.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import { z } from "zod";

import { errorSeveritySchema } from "./error.js";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Retention uygulanacak log kategorileri. */
export const logTypeSchema = z.enum([
  "audit_log",
  "error_event",
  "security_event",
  "job_run",
  "notification",
  "request_log",
]);
export type LogType = z.infer<typeof logTypeSchema>;

/** Severity (mevcut katalog). */
export const logRetentionSeveritySchema = errorSeveritySchema;
export type LogRetentionSeverity = z.infer<typeof logRetentionSeveritySchema>;

/** Arşiv depolama katmanı. */
export const archiveStorageSchema = z.enum(["hot", "cold", "none"]);
export type ArchiveStorage = z.infer<typeof archiveStorageSchema>;

/* --------------------------------------------------------------------------
 * Default politikalar (sabit kodlu; SUPERADMIN tarafından override edilir)
 * --------------------------------------------------------------------------
 */

/** Default retention matrisi. LogType × Severity → gün. */
export const DEFAULT_RETENTION_DAYS: Readonly<
  Record<LogType, Record<LogRetentionSeverity, number>>
> = {
  audit_log: {
    info: 365,
    warning: 365,
    error: 730,
    critical: 1825,
  },
  error_event: {
    info: 30,
    warning: 90,
    error: 180,
    critical: 365,
  },
  security_event: {
    info: 365,
    warning: 730,
    error: 1825,
    critical: 2555, // ~7 yıl (KVKK/UK GDPR uyumlu)
  },
  job_run: {
    info: 7,
    warning: 14,
    error: 30,
    critical: 90,
  },
  notification: {
    info: 30,
    warning: 60,
    error: 90,
    critical: 180,
  },
  request_log: {
    info: 7,
    warning: 14,
    error: 30,
    critical: 90,
  },
};

/** Default archive offset (retention süresinin kaç gün öncesinden
 *  itibaren arşive taşınsın). */
export const DEFAULT_ARCHIVE_AFTER_DAYS: Readonly<
  Record<LogType, Record<LogRetentionSeverity, number>>
> = {
  audit_log: {
    info: 90,
    warning: 90,
    error: 180,
    critical: 365,
  },
  error_event: {
    info: 7,
    warning: 14,
    error: 30,
    critical: 60,
  },
  security_event: {
    info: 90,
    warning: 180,
    error: 365,
    critical: 730,
  },
  job_run: {
    info: 1,
    warning: 3,
    error: 7,
    critical: 14,
  },
  notification: {
    info: 7,
    warning: 14,
    error: 30,
    critical: 60,
  },
  request_log: {
    info: 1,
    warning: 3,
    error: 7,
    critical: 14,
  },
};

/** Default storage katmanı. */
export const DEFAULT_ARCHIVE_STORAGE: Readonly<
  Record<LogType, Record<LogRetentionSeverity, ArchiveStorage>>
> = {
  audit_log: {
    info: "cold",
    warning: "cold",
    error: "cold",
    critical: "cold",
  },
  error_event: {
    info: "hot",
    warning: "hot",
    error: "cold",
    critical: "cold",
  },
  security_event: {
    info: "cold",
    warning: "cold",
    error: "cold",
    critical: "cold",
  },
  job_run: {
    info: "hot",
    warning: "hot",
    error: "hot",
    critical: "cold",
  },
  notification: {
    info: "hot",
    warning: "hot",
    error: "hot",
    critical: "cold",
  },
  request_log: {
    info: "hot",
    warning: "hot",
    error: "hot",
    critical: "cold",
  },
};

/* --------------------------------------------------------------------------
 * Policy sözleşmesi
 * --------------------------------------------------------------------------
 */

/** Tenant bazlı override policy. */
export const retentionPolicyUpsertSchema = z
  .object({
    tenantId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "null = global default override; tenantId = tenant-specific override.",
      ),
    logType: logTypeSchema,
    severity: logRetentionSeveritySchema,
    /** Canlı sistemde tutulacak gün (minimum 7). */
    retentionDays: z.coerce.number().int().min(7).max(3650),
    /** Bu kadar gün sonra arşive taşı (0..retentionDays). */
    archiveAfterDays: z.coerce.number().int().min(0).max(3650),
    archiveStorage: archiveStorageSchema,
    /** Arşivleme öncesi PII mask uygulansın mı? Default true. */
    redactPii: z.boolean().default(true),
  })
  .refine((v) => v.archiveAfterDays <= v.retentionDays, {
    message: "archiveAfterDays, retentionDays'ten büyük olamaz.",
    path: ["archiveAfterDays"],
  });
export type RetentionPolicyUpsert = z.infer<typeof retentionPolicyUpsertSchema>;

/** Tek bir policy. */
export const retentionPolicySchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid().nullable(),
  logType: logTypeSchema,
  severity: logRetentionSeveritySchema,
  retentionDays: z.number().int().min(7).max(3650),
  archiveAfterDays: z.number().int().min(0).max(3650),
  archiveStorage: archiveStorageSchema,
  redactPii: z.boolean(),
  createdById: z.string(),
  createdAt: z.string().datetime(),
  updatedById: z.string(),
  updatedAt: z.string().datetime(),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

/** Filtre. */
export const retentionPolicyFiltersSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(),
  logType: logTypeSchema.optional(),
  severity: logRetentionSeveritySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type RetentionPolicyFilters = z.infer<
  typeof retentionPolicyFiltersSchema
>;

/** Liste response. */
export const retentionPolicyListResponseSchema = z.object({
  items: z.array(retentionPolicySchema),
  total: z.number().int().nonnegative(),
});
export type RetentionPolicyListResponse = z.infer<
  typeof retentionPolicyListResponseSchema
>;

/* --------------------------------------------------------------------------
 * Sweep (süpürme) sonucu
 * --------------------------------------------------------------------------
 */

/** Tek bir (logType × severity) bucket için sweep özeti. */
export const retentionSweepBucketSchema = z.object({
  logType: logTypeSchema,
  severity: logRetentionSeveritySchema,
  /** Tarayan kayıt sayısı (görüldü). */
  scannedCount: z.number().int().nonnegative(),
  /** Arşive taşınan kayıt sayısı. */
  archivedCount: z.number().int().nonnegative(),
  /** Kalıcı olarak silinen kayıt sayısı. */
  deletedCount: z.number().int().nonnegative(),
  /** Hata sayısı (PII mask veya storage erişim hatası vb.). */
  errorCount: z.number().int().nonnegative(),
  /** Cutoff (delete cutoff) ISO datetime. */
  deleteCutoff: z.string().datetime(),
  /** Archive cutoff ISO datetime. */
  archiveCutoff: z.string().datetime(),
});
export type RetentionSweepBucket = z.infer<typeof retentionSweepBucketSchema>;

/** Sweep response. */
export const retentionSweepResultSchema = z.object({
  sweepId: z.string(),
  triggeredBy: z.enum(["manual", "scheduled", "system"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  totalScanned: z.number().int().nonnegative(),
  totalArchived: z.number().int().nonnegative(),
  totalDeleted: z.number().int().nonnegative(),
  totalErrors: z.number().int().nonnegative(),
  buckets: z.array(retentionSweepBucketSchema),
  dryRun: z.boolean(),
});
export type RetentionSweepResult = z.infer<typeof retentionSweepResultSchema>;

/** Sweep geçmişi filtresi. */
export const retentionSweepHistoryFiltersSchema = z.object({
  triggeredBy: z.enum(["manual", "scheduled", "system"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type RetentionSweepHistoryFilters = z.infer<
  typeof retentionSweepHistoryFiltersSchema
>;

/** Sweep geçmişi response. */
export const retentionSweepHistoryResponseSchema = z.object({
  items: z.array(retentionSweepResultSchema),
  total: z.number().int().nonnegative(),
});
export type RetentionSweepHistoryResponse = z.infer<
  typeof retentionSweepHistoryResponseSchema
>;

/* --------------------------------------------------------------------------
 * Sweep isteği
 * --------------------------------------------------------------------------
 */

/**
 * Sweep tetikleme isteği. SUPERADMIN tarafından manuel tetikleme
 * veya scheduled cron tarafından çağrılır. `dryRun=true` ise
 * hiçbir kayıt arşivlenmez/silinmez; yalnız sayım döner.
 */
export const triggerRetentionSweepSchema = z.object({
  /** Yalnız bu logType'larda çalış; boş bırakılırsa tümü. */
  logTypes: z.array(logTypeSchema).optional(),
  /** Dry-run modu (sayım yap, uygulama). */
  dryRun: z.boolean().default(false),
  /** Tetikleyen not (örn. "GDPR review Q3"). */
  note: z.string().max(500).optional(),
});
export type TriggerRetentionSweep = z.infer<
  typeof triggerRetentionSweepSchema
>;
