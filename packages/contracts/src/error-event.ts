/**
 * @file Merkezi backend hata olayı (ErrorEvent) API sözleşmesi.
 * @module @vetniva/contracts/error-event
 *
 * @description GOAL-100 (FAZ-10) merkezi backend hata yakalama
 * sözleşmesi. Tüm exception'lar `AllExceptionsFilter` tarafından
 * yakalanır ve bir `ErrorEvent` olarak persist edilir; bu sayede
 * Superadmin hata merkezi (GOAL-103) + atama/çözüm (GOAL-104)
 * + güvenlik alarmları (GOAL-105) tek bir kaynaktan beslenir.
 *
 * Yakalanan bilgiler (privacy-aware):
 * - `requestId`     : correlation ID (`req-<uuidv4>`).
 * - `tenantId`      : tenant kapsamı (null = pre-auth / system).
 * - `branchId`      : şube (varsa).
 * - `userId`        : actor ID (varsa; SYSTEM ise null).
 * - `actorType`     : user | system | portal_user.
 * - `module`        : hatanın sınıflandırıldığı modül (URL path'in
 *                     ilk segmenti; ör. "clinic", "auth", "inventory").
 * - `route`         : METHOD + path (ör. "GET /api/v1/clinic/pets").
 * - `release`       : uygulama sürümü (semver; `APP_VERSION` env).
 * - `severity`      : info | warning | error | critical.
 * - `fingerprint`   : 16 karakterlik hex (errorCode + module +
 *                     normalizeMessage hash). Aynı fingerprint
 *                     tek bir hata sınıfını temsil eder; duplicate
 *                     event'ler occurrenceCount ile takip edilir.
 * - `errorCode`     : VET-XXXX-NNNN kodu (legacysa AnyErrorCode).
 * - `message`       : güvenli hata mesajı (PII içermez).
 * - `statusCode`    : HTTP durumu.
 * - `stack`         : stack trace (sadece 5xx + critical; 4xx null).
 * - `context`       : sanitize edilmiş ek bilgi (request body
 *                     alan adları, query, headers, PII mask'lı).
 * - `country`       : TR | GB | SYSTEM.
 * - `occurredAt`    : ISO datetime (UTC).
 * - `occurrenceCount`: aynı fingerprint'in tekrar sayısı (1+).
 *
 * @security Context her zaman PII-MASKED; `password`, `token`,
 *   `email`, `phone` gibi alanlar filter katmanında mask'lenir.
 *   Stack trace yalnızca 5xx + critical için saklanır; aksi
 *   halde null. Bu sözleşmede PII YOKTUR; yalnızca yapısal alan
 *   adları ve tipleri.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import { z } from "zod";

import { errorCodeSchema, errorSeveritySchema } from "./error.js";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Hata kaynağı modülü. URL path'in ilk anlamlı segmentidir. */
export const errorEventModuleSchema = z.enum([
  "auth",
  "tenant",
  "branch",
  "identity",
  "rbac",
  "clinic",
  "appointment",
  "patient",
  "owner",
  "examination",
  "soap",
  "vaccine",
  "prescription",
  "surgery",
  "anesthesia",
  "hospitalization",
  "lab",
  "imaging",
  "inventory",
  "product",
  "supplier",
  "purchase",
  "stock",
  "petshop",
  "clinic_sale",
  "payment",
  "cash_register",
  "esmm",
  "report",
  "consent",
  "portal",
  "notification",
  "file",
  "feature_flag",
  "ai",
  "superadmin",
  "system",
  "unknown",
]);
export type ErrorEventModule = z.infer<typeof errorEventModuleSchema>;

/** Actor türü (audit ile aynı). */
export const errorEventActorTypeSchema = z.enum([
  "user",
  "system",
  "portal_user",
]);
export type ErrorEventActorType = z.infer<typeof errorEventActorTypeSchema>;

/** Ülke kodu (COUNTRY_ADAPTER ile uyumlu). */
export const errorEventCountrySchema = z.enum(["TR", "GB", "SYSTEM"]);
export type ErrorEventCountry = z.infer<typeof errorEventCountrySchema>;

/* --------------------------------------------------------------------------
 * Hata olayı girdisi (internal — AllExceptionsFilter'dan çağrılır)
 * --------------------------------------------------------------------------
 */

/**
 * Hata olayı oluşturma girdisi. Filter tarafından doldurulur.
 * `errorCode` zorunlu; mesaj, stack, context opsiyonel.
 */
export const errorEventCreateInputSchema = z.object({
  requestId: z.string().min(1).max(128),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  userId: z.string().min(1).max(100).nullable(),
  actorType: errorEventActorTypeSchema,
  module: errorEventModuleSchema,
  route: z.string().min(1).max(512),
  release: z.string().min(1).max(64),
  severity: errorSeveritySchema,
  errorCode: errorCodeSchema,
  message: z.string().min(1).max(2000),
  statusCode: z.number().int().min(100).max(599),
  stack: z.string().max(20000).nullable().optional(),
  context: z.record(z.unknown()).optional(),
  country: errorEventCountrySchema,
  occurredAt: z.string().datetime().optional(),
});
export type ErrorEventCreateInput = z.infer<
  typeof errorEventCreateInputSchema
>;

/* --------------------------------------------------------------------------
 * Hata olayı response şeması
 * --------------------------------------------------------------------------
 */

/** Tek bir hata olayı (response). */
export const errorEventSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  userId: z.string().nullable(),
  actorType: errorEventActorTypeSchema,
  module: errorEventModuleSchema,
  route: z.string(),
  release: z.string(),
  severity: errorSeveritySchema,
  fingerprint: z.string().length(16),
  errorCode: errorCodeSchema,
  message: z.string(),
  statusCode: z.number().int(),
  stack: z.string().nullable(),
  context: z.record(z.unknown()),
  country: errorEventCountrySchema,
  occurredAt: z.string().datetime(),
  /** Aynı fingerprint'in toplam tekrar sayısı (1+). */
  occurrenceCount: z.number().int().positive(),
});
export type ErrorEvent = z.infer<typeof errorEventSchema>;

/* --------------------------------------------------------------------------
 * Filtreler
 * --------------------------------------------------------------------------
 */

/** Liste filtreleri. SUPERADMIN merkezi için. */
export const errorEventFiltersSchema = z.object({
  severity: errorSeveritySchema.optional(),
  module: errorEventModuleSchema.optional(),
  errorCode: errorCodeSchema.optional(),
  fingerprint: z.string().length(16).optional(),
  tenantId: z.string().uuid().optional(),
  country: errorEventCountrySchema.optional(),
  route: z.string().max(512).optional(),
  /** ISO datetime (UTC); occurredAt >= from. */
  from: z.string().datetime().optional(),
  /** ISO datetime (UTC); occurredAt <= to. */
  to: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ErrorEventFilters = z.infer<typeof errorEventFiltersSchema>;

/** Liste response şeması. */
export const errorEventListResponseSchema = z.object({
  items: z.array(errorEventSchema),
  total: z.number().int().nonnegative(),
});
export type ErrorEventListResponse = z.infer<
  typeof errorEventListResponseSchema
>;

/* --------------------------------------------------------------------------
 * Özet (aggregate)
 * --------------------------------------------------------------------------
 */

/**
 * Özet tek bir bucket: severity × module × errorCode kırılımı.
 * Süperadmin merkezinde severity + module bazlı kartlar için.
 */
export const errorEventBucketSchema = z.object({
  severity: errorSeveritySchema,
  module: errorEventModuleSchema,
  errorCode: errorCodeSchema,
  fingerprint: z.string().length(16),
  eventCount: z.number().int().nonnegative(),
  uniqueTenants: z.number().int().nonnegative(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});
export type ErrorEventBucket = z.infer<typeof errorEventBucketSchema>;

/** Severity bazlı toplam. */
export const errorEventSeverityCountSchema = z.object({
  severity: errorSeveritySchema,
  count: z.number().int().nonnegative(),
});
export type ErrorEventSeverityCount = z.infer<
  typeof errorEventSeverityCountSchema
>;

/** Module bazlı toplam. */
export const errorEventModuleCountSchema = z.object({
  module: errorEventModuleSchema,
  count: z.number().int().nonnegative(),
});
export type ErrorEventModuleCount = z.infer<
  typeof errorEventModuleCountSchema
>;

/** Genel özet. */
export const errorEventSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  bySeverity: z.array(errorEventSeverityCountSchema),
  byModule: z.array(errorEventModuleCountSchema),
  topBuckets: z.array(errorEventBucketSchema),
  windowFrom: z.string().datetime().nullable(),
  windowTo: z.string().datetime().nullable(),
});
export type ErrorEventSummary = z.infer<typeof errorEventSummarySchema>;

/** Özet endpoint sorgu şeması. */
export const errorEventSummaryQuerySchema = z.object({
  module: errorEventModuleSchema.optional(),
  country: errorEventCountrySchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ErrorEventSummaryQuery = z.infer<
  typeof errorEventSummaryQuerySchema
>;

/* --------------------------------------------------------------------------
 * Client (frontend) hata raporu — GOAL-101
 * --------------------------------------------------------------------------
 */

/**
 * Frontend'ten gelen hata raporu şeması. Yalnızca kullanıcının
 * tarayıcısından gönderebileceği alanları kabul eder; tenant/branch/
 * userId/actorType/requestId/country bilgileri backend tarafında
 * oturum/header'dan türetilir. Bu sayede istemci tarafı
 * impersonation saldırılarına karşı korunmuş olur.
 *
 * Zorunlu: severity, message, route.
 * Opsiyonel: errorCode (yoksa generic frontend kodu), stack, context,
 *            occurredAt (client clock), release, country.
 */
export const clientErrorReportInputSchema = z.object({
  severity: errorSeveritySchema,
  errorCode: errorCodeSchema.optional(),
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional(),
  context: z.record(z.unknown()).optional(),
  route: z.string().min(1).max(512),
  occurredAt: z.string().datetime().optional(),
  release: z.string().min(1).max(64).optional(),
  country: errorEventCountrySchema.optional(),
});
export type ClientErrorReportInput = z.infer<
  typeof clientErrorReportInputSchema
>;

/**
 * Frontend raporunun kabul edildiğine dair minimal yanıt. Tam
 * ErrorEvent dönmek yerine yalnızca id + fingerprint paylaşılır;
 * istemci tarafı için yeterli korelasyon bilgisidir.
 */
export const clientErrorReportResponseSchema = z.object({
  id: z.string(),
  fingerprint: z.string().length(16),
});
export type ClientErrorReportResponse = z.infer<
  typeof clientErrorReportResponseSchema
>;
