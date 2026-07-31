/**
 * @file Background job ve entegrasyon logları sözleşmesi.
 * @module @vetniva/contracts/job-run
 *
 * @description GOAL-102 (FAZ-10) BullMQ job'ları ve harici adapter
 * çağrılarının durum, retry, duration, error ve correlation
 * kayıtlarını tutan JobRun API sözleşmesi.
 *
 * JobRun kavramı:
 * - Bir background job veya entegrasyon çağrısının **tek bir
 *   denemesini** temsil eder. Retry yapılırsa yeni bir JobRun
 *   kaydı açılır (parentRunId ile bağlanır).
 * - `jobKey` mantıksal iş anahtarıdır (ör. "appointment-reminder
 *   |appt-1234"). Aynı jobKey'e sahip birden fazla JobRun
 *   olabilir; bunlar aynı işin farklı denemeleridir.
 * - Status akışı: `pending` → `running` → `succeeded` | `failed`
 *   | `dead_letter`. `dead_letter` yalnızca `attempt >= maxAttempts`
 *   olduğunda terminal olur; aksi halde `failed` kalır (yeniden
 *   denenebilir).
 *
 * Yakalanan bilgiler:
 * - `id`              : run kaydı id'si (`jr-...` formatında).
 * - `queueName`       : BullMQ kuyruk adı (ör. "appointment-reminders").
 * - `jobName`         : iş adı (ör. "send-reminder").
 * - `jobKey`          : mantıksal anahtar (idempotency/dedup).
 * - `status`          : pending | running | succeeded | failed | dead_letter.
 * - `attempt`         : 1-based deneme sayısı.
 * - `maxAttempts`     : izin verilen maksimum deneme (default 3).
 * - `tenantId`        : tenant kapsamı (varsa; null = system).
 * - `branchId`        : şube (varsa).
 * - `correlationId`   : kök çağrının correlation ID'si.
 * - `requestId`       : tetikleyen HTTP isteğinin ID'si (varsa).
 * - `actorId`         : tetikleyen kullanıcı (varsa; "system" job'lar için null).
 * - `actorType`       : user | system | portal_user.
 * - `input`           : job payload (PII mask'lı).
 * - `output`          : sonuç (PII mask'lı; succeeded durumda).
 * - `errorCode`       : hata kodu (failed/dead_letter için).
 * - `errorMessage`    : hata mesajı (PII içermez).
 * - `errorStack`      : stack trace (sadece failed/dead_letter).
 * - `startedAt`       : deneme başlangıç zamanı.
 * - `finishedAt`      : deneme bitiş zamanı (terminal durumlarda).
 * - `durationMs`      : deneme süresi (ms; finishedAt - startedAt).
 * - `parentRunId`     : önceki denemenin run id'si (retry/re-run için).
 * - `triggeredBy`     : actorId | "system" | "manual_retry".
 * - `release`         : uygulama sürümü (semver; `APP_VERSION` env).
 *
 * @security `input` ve `output` payload'ları `PiiMasker`'dan geçirilir;
 *   `errorMessage` PII içermez; `errorStack` yalnızca failed/dead_letter
 *   için saklanır. Tenant filtresi opsiyoneldir; SUPERADMIN cross-tenant
 *   görebilir. Cross-tenant sorgu denemesi 404 ile maskelenir.
 *
 * @since GOAL-102 (FAZ-10) background job ve entegrasyon logları core
 */

import { z } from "zod";

import {
  anyErrorCodeSchema,
} from "./error.js";
import {
  errorEventActorTypeSchema,
  errorEventCountrySchema,
} from "./error-event.js";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Job run durumu. */
export const jobRunStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
]);
export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;

/** Job run kaynağı (BullMQ kuyruğu vs. entegrasyon çağrısı). */
export const jobRunSourceSchema = z.enum([
  "queue", // BullMQ job
  "adapter", // harici adapter (lab, e-smm, ödeme)
  "cron", // periyodik job
  "system", // internal/system event
]);
export type JobRunSource = z.infer<typeof jobRunSourceSchema>;

/** Job run tetikleyen. */
export const jobRunTriggeredBySchema = z.enum([
  "user", // kullanıcı başlattı
  "system", // otomatik (retry, cron)
  "manual_retry", // operatör manuel tetikledi
  "integration", // dış sistem callback
]);
export type JobRunTriggeredBy = z.infer<typeof jobRunTriggeredBySchema>;

/** Ülke kodu (audit ile aynı). */
export const jobRunCountrySchema = errorEventCountrySchema;
export type JobRunCountry = z.infer<typeof jobRunCountrySchema>;

/* --------------------------------------------------------------------------
 * JobRun şeması (response)
 * --------------------------------------------------------------------------
 */

/** Tek bir job run kaydı. */
export const jobRunSchema = z.object({
  id: z.string().min(1),
  queueName: z.string().min(1).max(128),
  jobName: z.string().min(1).max(128),
  jobKey: z.string().min(1).max(256),
  source: jobRunSourceSchema,
  status: jobRunStatusSchema,
  attempt: z.number().int().min(1).max(1000),
  maxAttempts: z.number().int().min(1).max(1000),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  correlationId: z.string().min(1).max(128),
  requestId: z.string().max(128).nullable(),
  actorId: z.string().min(1).max(100).nullable(),
  actorType: errorEventActorTypeSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  errorCode: anyErrorCodeSchema.nullable(),
  errorMessage: z.string().max(2000).nullable(),
  errorStack: z.string().max(20000).nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  parentRunId: z.string().nullable(),
  triggeredBy: jobRunTriggeredBySchema,
  country: jobRunCountrySchema,
  release: z.string().min(1).max(64),
});
export type JobRun = z.infer<typeof jobRunSchema>;

/* --------------------------------------------------------------------------
 * Girdi şemaları (create / finish / retry)
 * --------------------------------------------------------------------------
 */

/**
 * Yeni job run başlatma girdisi. `startRun` çağrısında kullanılır.
 * `id`/`startedAt` otomatik üretilir; `attempt` default 1.
 */
export const jobRunStartInputSchema = z.object({
  queueName: z.string().min(1).max(128),
  jobName: z.string().min(1).max(128),
  jobKey: z.string().min(1).max(256),
  source: jobRunSourceSchema.default("queue"),
  maxAttempts: z.number().int().min(1).max(1000).default(3),
  tenantId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  correlationId: z.string().min(1).max(128).optional(),
  requestId: z.string().max(128).nullable().optional(),
  actorId: z.string().min(1).max(100).nullable().optional(),
  actorType: errorEventActorTypeSchema.default("system"),
  input: z.record(z.unknown()).default({}),
  triggeredBy: jobRunTriggeredBySchema.default("system"),
  country: jobRunCountrySchema.default("SYSTEM"),
  release: z.string().min(1).max(64).optional(),
});
export type JobRunStartInput = z.infer<typeof jobRunStartInputSchema>;

/**
 * Job run sonuçlandırma girdisi. `finishRun` çağrısında kullanılır.
 * `succeeded` durumunda `output` zorunludur; `failed`/`dead_letter`
 * durumunda `errorCode` zorunludur.
 */
export const jobRunFinishInputSchema = z
  .object({
    status: z.enum(["succeeded", "failed", "dead_letter"]),
    output: z.record(z.unknown()).optional(),
    errorCode: anyErrorCodeSchema.optional(),
    errorMessage: z.string().max(2000).optional(),
    errorStack: z.string().max(20000).optional(),
  })
  .refine(
    (v) =>
      v.status !== "succeeded" || (v.output !== undefined && v.output !== null),
    { message: "succeeded durumda output zorunludur", path: ["output"] },
  )
  .refine(
    (v) =>
      v.status === "succeeded" || (v.errorCode !== undefined && v.errorCode !== null),
    { message: "failed/dead_letter durumda errorCode zorunludur", path: ["errorCode"] },
  );
export type JobRunFinishInput = z.infer<typeof jobRunFinishInputSchema>;

/* --------------------------------------------------------------------------
 * Filtreler
 * --------------------------------------------------------------------------
 */

/** Liste filtreleri. SUPERADMIN paneli için. */
export const jobRunFiltersSchema = z.object({
  queueName: z.string().max(128).optional(),
  jobName: z.string().max(128).optional(),
  jobKey: z.string().max(256).optional(),
  status: jobRunStatusSchema.optional(),
  source: jobRunSourceSchema.optional(),
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  correlationId: z.string().max(128).optional(),
  country: jobRunCountrySchema.optional(),
  triggeredBy: jobRunTriggeredBySchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type JobRunFilters = z.infer<typeof jobRunFiltersSchema>;

/** Liste response şeması. */
export const jobRunListResponseSchema = z.object({
  items: z.array(jobRunSchema),
  total: z.number().int().nonnegative(),
});
export type JobRunListResponse = z.infer<typeof jobRunListResponseSchema>;

/** Job key bazlı deneme listesi. */
export const jobRunAttemptsByKeyResponseSchema = z.object({
  jobKey: z.string(),
  items: z.array(jobRunSchema),
  total: z.number().int().nonnegative(),
  /** Tüm denemeler başarısız olduysa true. */
  allFailed: z.boolean(),
  /** Son deneme durumu. */
  lastStatus: jobRunStatusSchema.nullable(),
});
export type JobRunAttemptsByKeyResponse = z.infer<
  typeof jobRunAttemptsByKeyResponseSchema
>;

/* --------------------------------------------------------------------------
 * Dead-letter
 * --------------------------------------------------------------------------
 */

/**
 * Dead-letter sorgu şeması. Yalnızca `status = dead_letter` olan
 * kayıtları döner; tenant filtresi opsiyonel.
 */
export const deadLetterQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  queueName: z.string().max(128).optional(),
  jobName: z.string().max(128).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type DeadLetterQuery = z.infer<typeof deadLetterQuerySchema>;

/* --------------------------------------------------------------------------
 * Retry
 * --------------------------------------------------------------------------
 */

/**
 * Manuel retry girdisi. Bir failed/dead_letter run'dan yeni bir
 * deneme başlatır. Yeni run `parentRunId` ile eski run'a bağlanır.
 */
export const jobRunRetryInputSchema = z.object({
  /** Yeni denemenin maxAttempts değeri. Eski run'ı override eder. */
  maxAttempts: z.number().int().min(1).max(1000).optional(),
  /** Yeni deneme için override input. Verilmezse eski input kullanılır. */
  input: z.record(z.unknown()).optional(),
  /** Neden yeniden deneniyor. Operatör notu. */
  reason: z.string().min(1).max(500).optional(),
});
export type JobRunRetryInput = z.infer<typeof jobRunRetryInputSchema>;

/* --------------------------------------------------------------------------
 * Özet (aggregate)
 * --------------------------------------------------------------------------
 */

/** Queue adı bazlı özet. */
export const jobRunQueueCountSchema = z.object({
  queueName: z.string(),
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  deadLetter: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export type JobRunQueueCount = z.infer<typeof jobRunQueueCountSchema>;

/** Status bazlı özet. */
export const jobRunStatusCountSchema = z.object({
  status: jobRunStatusSchema,
  count: z.number().int().nonnegative(),
});
export type JobRunStatusCount = z.infer<typeof jobRunStatusCountSchema>;

/** Genel özet. */
export const jobRunSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: z.array(jobRunStatusCountSchema),
  byQueue: z.array(jobRunQueueCountSchema),
  /** Son 24 saatteki dead-letter sayısı. */
  deadLetterLast24h: z.number().int().nonnegative(),
  /** En eski bekleyen (running/pending) run'ın startedAt değeri. */
  oldestRunningAt: z.string().datetime().nullable(),
  windowFrom: z.string().datetime().nullable(),
  windowTo: z.string().datetime().nullable(),
});
export type JobRunSummary = z.infer<typeof jobRunSummarySchema>;

/** Özet sorgu şeması. */
export const jobRunSummaryQuerySchema = z.object({
  queueName: z.string().max(128).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type JobRunSummaryQuery = z.infer<typeof jobRunSummaryQuerySchema>;
