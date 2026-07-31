/**
 * @file Güvenlik olayı (SecurityEvent) API sözleşmesi.
 * @module @vetniva/contracts/security-event
 *
 * @description GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları
 * sözleşmesi. Backend'in çeşitli katmanlarından (auth, RBAC guard,
 * tenant guard, audit interceptor, vb.) toplanan güvenlik olaylarını
 * tek bir merkezi kayıtta birleştirir. Superadmin güvenlik paneli
 * (ileride UI) bu kayıtları okur; kritik olaylarda alarm adapter'i
 * tetiklenir (sayı eşikleri + aynı anda N tenant vb.).
 *
 * Kapsanan olay tipleri (securityEventTypeSchema):
 * - `failed_login`              : kimlik doğrulama başarısız (yanlış
 *                                  şifre, MFA hatası, token süresi dolmuş).
 * - `unauthorized_access_attempt`: 403/401 dönen yetkisiz erişim denemesi.
 * - `suspicious_export`         : büyük veri indirme (export endpoint'i
 *                                  ile kısa sürede yüksek satır).
 * - `role_change`               : kullanıcı rolü değişikliği
 *                                  (RBAC tarafından bildirilir).
 * - `tenant_isolation_breach_attempt`: actor.tenantId ile resource
 *                                  tenantId uyuşmazlığı; cross-tenant
 *                                  erişim denemesi.
 *
 * Yakalanan bilgiler (privacy-aware):
 * - `id`               : benzersiz kayıt ID.
 * - `requestId`        : correlation ID (`req-<uuidv4>`).
 * - `tenantId`         : tenant kapsamı (null = pre-auth / system).
 * - `branchId`         : şube (varsa).
 * - `userId`           : denemeyi yapan kullanıcı (biliniyorsa).
 * - `actorType`        : user | system | portal_user.
 * - `type`             : securityEventTypeSchema.
 * - `module`           : hatanın sınıflandırıldığı modül (URL path'in
 *                         ilk segmenti; ör. "auth", "clinic").
 * - `route`            : METHOD + path.
 * - `release`          : uygulama sürümü (semver).
 * - `severity`         : info | warning | error | critical.
 * - `fingerprint`      : 16 karakterlik hex (type + module +
 *                         normalizeMessage hash). Aynı fingerprint
 *                         tek bir saldırı sınıfını temsil eder.
 * - `errorCode`        : VET-XXXX-NNNN kodu (opsiyonel; tipten
 *                         türetilebilir ama caller override edebilir).
 * - `message`          : güvenli mesaj (PII içermez).
 * - `statusCode`       : HTTP durumu (varsa).
 * - `ipAddress`        : mask'li IP (192.168.1.***).
 * - `userAgentHash`    : user agent kısa hash.
 * - `context`          : sanitize edilmiş ek bilgi (PII mask'lı).
 * - `country`          : TR | GB | SYSTEM.
 * - `occurredAt`       : ISO datetime (UTC) — en son görülme.
 * - `firstSeenAt`      : ISO datetime (UTC) — ilk görülme.
 * - `lastSeenAt`       : ISO datetime (UTC) — son görülme.
 * - `occurrenceCount`  : aynı fingerprint'in tekrar sayısı (1+).
 * - `alertSent`        : critical olayda alarm adapter tetiklendi mi?
 *
 * @security Context her zaman PII-MASKED; `password`, `token`,
 *   `email`, `phone` gibi alanlar backend tarafında mask'lenir. IP
 *   `192.168.1.***` formatında saklanır. Bu sözleşmede PII
 *   YOKTUR; yalnızca yapısal alan adları ve tipleri.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import { z } from "zod";

import { errorCodeSchema, errorSeveritySchema } from "./error.js";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Güvenlik olay türleri. */
export const securityEventTypeSchema = z.enum([
  "failed_login",
  "unauthorized_access_attempt",
  "suspicious_export",
  "role_change",
  "tenant_isolation_breach_attempt",
]);
export type SecurityEventType = z.infer<typeof securityEventTypeSchema>;

/** Modül. ErrorEvent ile aynı katalog kullanılır (URL path'ten türetilir). */
export const securityEventModuleSchema = z.enum([
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
export type SecurityEventModule = z.infer<typeof securityEventModuleSchema>;

/** Aktör tipi. ErrorEvent ile aynı. */
export const securityEventActorTypeSchema = z.enum([
  "user",
  "system",
  "portal_user",
]);
export type SecurityEventActorType = z.infer<typeof securityEventActorTypeSchema>;

/** Ülke. ErrorEvent ile aynı. */
export const securityEventCountrySchema = z.enum(["TR", "GB", "SYSTEM"]);
export type SecurityEventCountry = z.infer<typeof securityEventCountrySchema>;

/* --------------------------------------------------------------------------
 * Severity (error severity'den miras) — tekrar export
 * --------------------------------------------------------------------------
 */

export const securityEventSeveritySchema = errorSeveritySchema;
export type SecurityEventSeverity = z.infer<typeof errorSeveritySchema>;

/* --------------------------------------------------------------------------
 * Olay oluşturma girdisi
 * --------------------------------------------------------------------------
 */

/**
 * Güvenlik olayı oluşturma girdisi. Auth/RBAC/tenant guard
 * interceptor'larından çağrılır. `tenantId`/`branchId`/`userId`/
 * `actorType`/`requestId`/`country`/`ipAddress`/`userAgentHash`
 * gibi alanlar **aktör bağlamından türetilir**; istemci tarafından
 * gönderilmez.
 *
 * Zorunlu: type, message, module (veya route), severity.
 * Opsiyonel: errorCode (tipe göre default), statusCode, context.
 */
export const securityEventCreateInputSchema = z.object({
  type: securityEventTypeSchema,
  message: z.string().min(1).max(2000),
  severity: securityEventSeveritySchema,
  module: securityEventModuleSchema.optional(),
  route: z.string().min(1).max(512).optional(),
  errorCode: errorCodeSchema.optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  context: z.record(z.unknown()).optional(),
  /** ISO datetime (UTC). Boşsa `new Date()` kullanılır. */
  occurredAt: z.string().datetime().optional(),
  /** Saldırı sınıfını daraltmak için caller tarafından override
   *  edilebilir; aksi halde service türetir. */
  fingerprint: z.string().length(16).optional(),
});
export type SecurityEventCreateInput = z.infer<
  typeof securityEventCreateInputSchema
>;

/* --------------------------------------------------------------------------
 * Olay response şeması
 * --------------------------------------------------------------------------
 */

/** Tek bir güvenlik olayı (response). */
export const securityEventSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  userId: z.string().nullable(),
  actorType: securityEventActorTypeSchema,
  type: securityEventTypeSchema,
  module: securityEventModuleSchema,
  route: z.string(),
  release: z.string(),
  severity: securityEventSeveritySchema,
  fingerprint: z.string().length(16),
  errorCode: errorCodeSchema.nullable(),
  message: z.string(),
  statusCode: z.number().int().nullable(),
  ipAddress: z.string().nullable(),
  userAgentHash: z.string().nullable(),
  context: z.record(z.unknown()),
  country: securityEventCountrySchema,
  occurredAt: z.string().datetime(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  occurrenceCount: z.number().int().positive(),
  /** Critical olayda alarm adapter tetiklendi mi? (UI için) */
  alertSent: z.boolean(),
});
export type SecurityEvent = z.infer<typeof securityEventSchema>;

/* --------------------------------------------------------------------------
 * Filtreler ve response'lar
 * --------------------------------------------------------------------------
 */

/** SUPERADMIN paneli için liste filtreleri. */
export const securityEventFiltersSchema = z.object({
  type: securityEventTypeSchema.optional(),
  severity: securityEventSeveritySchema.optional(),
  module: securityEventModuleSchema.optional(),
  fingerprint: z.string().length(16).optional(),
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  userId: z.string().max(100).optional(),
  country: securityEventCountrySchema.optional(),
  release: z.string().max(64).optional(),
  route: z.string().max(512).optional(),
  /** ISO datetime (UTC); firstSeenAt >= from. */
  from: z.string().datetime().optional(),
  /** ISO datetime (UTC); lastSeenAt <= to. */
  to: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type SecurityEventFilters = z.infer<typeof securityEventFiltersSchema>;

/** Liste response şeması. */
export const securityEventListResponseSchema = z.object({
  items: z.array(securityEventSchema),
  total: z.number().int().nonnegative(),
});
export type SecurityEventListResponse = z.infer<
  typeof securityEventListResponseSchema
>;

/* --------------------------------------------------------------------------
 * Özet (aggregate)
 * --------------------------------------------------------------------------
 */

/** Severity bazlı toplam. */
export const securityEventSeverityCountSchema = z.object({
  severity: securityEventSeveritySchema,
  count: z.number().int().nonnegative(),
});
export type SecurityEventSeverityCount = z.infer<
  typeof securityEventSeverityCountSchema
>;

/** Type bazlı toplam. */
export const securityEventTypeCountSchema = z.object({
  type: securityEventTypeSchema,
  count: z.number().int().nonnegative(),
});
export type SecurityEventTypeCount = z.infer<
  typeof securityEventTypeCountSchema
>;

/** Tek bir saldırı sınıfı (fingerprint bazlı) — özet kartları için. */
export const securityEventGroupSchema = z.object({
  fingerprint: z.string().length(16),
  type: securityEventTypeSchema,
  severity: securityEventSeveritySchema,
  module: securityEventModuleSchema,
  message: z.string(),
  eventCount: z.number().int().nonnegative(),
  uniqueTenants: z.number().int().nonnegative(),
  uniqueUsers: z.number().int().nonnegative(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  alertSent: z.boolean(),
});
export type SecurityEventGroup = z.infer<typeof securityEventGroupSchema>;

/** Özet response. */
export const securityEventSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  bySeverity: z.array(securityEventSeverityCountSchema),
  byType: z.array(securityEventTypeCountSchema),
  topGroups: z.array(securityEventGroupSchema),
  windowFrom: z.string().datetime().nullable(),
  windowTo: z.string().datetime().nullable(),
});
export type SecurityEventSummary = z.infer<typeof securityEventSummarySchema>;

/** Özet sorgu şeması. */
export const securityEventSummaryQuerySchema = z.object({
  type: securityEventTypeSchema.optional(),
  module: securityEventModuleSchema.optional(),
  country: securityEventCountrySchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type SecurityEventSummaryQuery = z.infer<
  typeof securityEventSummaryQuerySchema
>;

/* --------------------------------------------------------------------------
 * Frontend (istemci) raporu
 * --------------------------------------------------------------------------
 */

/**
 * Frontend'ten gelen güvenlik olayı raporu. Yalnızca
 * tarayıcıda tespit edilebilen olaylar için (örn. beklenmedik 401
 * flood'u, MFA prompt cancel). Backend filtre/zaten aynı şemayı
 * kullandığı için tek şema yeterlidir. Auth placeholder tüm
 * oturum açmış kullanıcılara kabul eder; tenant/branch/userId/
 * actorType/requestId/country/ipAddress/userAgentHash aktör
 * bağlamından türetilir.
 */
export const clientSecurityEventInputSchema = z.object({
  type: securityEventTypeSchema,
  message: z.string().min(1).max(2000),
  severity: securityEventSeveritySchema.optional(),
  errorCode: errorCodeSchema.optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  context: z.record(z.unknown()).optional(),
  route: z.string().min(1).max(512),
  occurredAt: z.string().datetime().optional(),
  release: z.string().min(1).max(64).optional(),
  country: securityEventCountrySchema.optional(),
});
export type ClientSecurityEventInput = z.infer<
  typeof clientSecurityEventInputSchema
>;

/**
 * Client raporunun kabul edildiğine dair minimal yanıt. id +
 * fingerprint paylaşılır; UI korelasyon için yeterli.
 */
export const clientSecurityEventResponseSchema = z.object({
  id: z.string(),
  fingerprint: z.string().length(16),
  alertSent: z.boolean(),
});
export type ClientSecurityEventResponse = z.infer<
  typeof clientSecurityEventResponseSchema
>;
