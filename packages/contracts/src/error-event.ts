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
 * - `occurredAt`    : ISO datetime (UTC) — en son görülme.
 * - `firstSeenAt`   : ISO datetime (UTC) — ilk görülme.
 * - `lastSeenAt`    : ISO datetime (UTC) — son görülme.
 * - `occurrenceCount`: aynı fingerprint'in tekrar sayısı (1+).
 * - `status`        : SUPERADMIN hata merkezi state machine
 *                     (new → investigating → resolved → reopened).
 * - `assignedToUserId`: atanan SUPERADMIN kullanıcı (opsiyonel).
 *
 * @security Context her zaman PII-MASKED; `password`, `token`,
 *   `email`, `phone` gibi alanlar filter katmanında mask'lenir.
 *   Stack trace yalnızca 5xx + critical için saklanır; aksi
 *   halde null. Bu sözleşmede PII YOKTUR; yalnızca yapısal alan
 *   adları ve tipleri.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 * @updated GOAL-104 (FAZ-10) hata atama ve çözüm notları core
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

/**
 * Hata olayı durum yönetimi (SUPERADMIN hata merkezi — GOAL-103).
 * Akış: new → investigating → resolved → reopened (reopened yeniden
 * investigating'e geçebilir; new ↔ resolved tek adımda da olabilir).
 *
 * - `new`         : hata yeni kaydedildi, henüz incelenmedi.
 * - `investigating`: bir SUPERADMIN hatayı sahiplendi, çalışılıyor.
 * - `resolved`    : çözüldü olarak işaretlendi; sonradan yeniden
 *                   görülürse otomatik `reopened`'a terfi eder.
 * - `reopened`    : `resolved` bir kayıt tekrar hata aldığında
 *                   otomatik terfi edilir; SUPERADMIN tekrar
 *                   `investigating`'e alabilir.
 */
export const errorEventStatusSchema = z.enum([
  "new",
  "investigating",
  "resolved",
  "reopened",
]);
export type ErrorEventStatus = z.infer<typeof errorEventStatusSchema>;

/** Hata durumu geçiş kaydı (append-only audit). */
export const errorEventStatusTransitionSchema = z.object({
  id: z.string(),
  /** Fingerprint (16 hex) — kayıt ile ilişki. */
  fingerprint: z.string().length(16),
  fromStatus: errorEventStatusSchema,
  toStatus: errorEventStatusSchema,
  /** Geçişi yapan SUPERADMIN (actor). */
  actorId: z.string(),
  actorType: errorEventActorTypeSchema,
  reason: z.string().max(1000).nullable(),
  occurredAt: z.string().datetime(),
});
export type ErrorEventStatusTransition = z.infer<
  typeof errorEventStatusTransitionSchema
>;

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
  /** İlk görülme zamanı (UTC). */
  firstSeenAt: z.string().datetime(),
  /** Son görülme zamanı (UTC) — `occurredAt` ile aynı mantık. */
  lastSeenAt: z.string().datetime(),
  /** Aynı fingerprint'in toplam tekrar sayısı (1+). */
  occurrenceCount: z.number().int().positive(),
  /** SUPERADMIN hata merkezi durum yönetimi (GOAL-103). */
  status: errorEventStatusSchema,
  /** Atanan SUPERADMIN kullanıcı ID (null = atanmadı). */
  assignedToUserId: z.string().nullable(),
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
  branchId: z.string().uuid().optional(),
  country: errorEventCountrySchema.optional(),
  release: z.string().max(64).optional(),
  route: z.string().max(512).optional(),
  /** SUPERADMIN hata merkezi durum filtresi (GOAL-103). */
  status: errorEventStatusSchema.optional(),
  /** Atanan SUPERADMIN kullanıcı ID. */
  assignedToUserId: z.string().max(100).optional(),
  /** ISO datetime (UTC); firstSeenAt >= from. */
  from: z.string().datetime().optional(),
  /** ISO datetime (UTC); lastSeenAt <= to. */
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
 * Durum yönetimi — GOAL-103 superadmin hata merkezi
 * --------------------------------------------------------------------------
 */

/**
 * Hata durumu güncelleme girdisi. State machine aşağıdaki
 * geçişlere izin verir; geçersiz durum 422 ile reddedilir.
 *
 * - new → investigating | resolved
 * - investigating → resolved
 * - resolved → reopened (yeni hata oluştuğunda otomatik)
 * - reopened → investigating
 *
 * `assignedToUserId` opsiyonel; belirtilirse status ile birlikte
 * atanır. Belirtilmezse mevcut atama korunur (null yapılmaz).
 * `clearAssignment=true` ile atama kaldırılabilir.
 */
export const errorEventStatusUpdateInputSchema = z.object({
  toStatus: errorEventStatusSchema,
  reason: z.string().max(1000).optional(),
  assignedToUserId: z.string().min(1).max(100).optional(),
  clearAssignment: z.boolean().optional(),
});
export type ErrorEventStatusUpdateInput = z.infer<
  typeof errorEventStatusUpdateInputSchema
>;

/** Status güncelleme response: event + yeni oluşan transition. */
export const errorEventStatusUpdateResponseSchema = z.object({
  event: errorEventSchema,
  transition: errorEventStatusTransitionSchema,
});
export type ErrorEventStatusUpdateResponse = z.infer<
  typeof errorEventStatusUpdateResponseSchema
>;

/** Hata durumu geçiş listesi response. */
export const errorEventListTransitionsResponseSchema = z.object({
  fingerprint: z.string().length(16),
  items: z.array(errorEventStatusTransitionSchema),
  total: z.number().int().nonnegative(),
});
export type ErrorEventListTransitionsResponse = z.infer<
  typeof errorEventListTransitionsResponseSchema
>;

/* --------------------------------------------------------------------------
 * Hata grupları (fingerprint bazlı) — GOAL-103
 * --------------------------------------------------------------------------
 */

/** Filtreli hata grupları sorgu şeması. */
export const errorEventGroupFiltersSchema = z.object({
  severity: errorSeveritySchema.optional(),
  module: errorEventModuleSchema.optional(),
  errorCode: errorCodeSchema.optional(),
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  country: errorEventCountrySchema.optional(),
  release: z.string().max(64).optional(),
  status: errorEventStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ErrorEventGroupFilters = z.infer<
  typeof errorEventGroupFiltersSchema
>;

/** Tek bir hata grubu (fingerprint bazlı). */
export const errorEventGroupSchema = z.object({
  fingerprint: z.string().length(16),
  severity: errorSeveritySchema,
  module: errorEventModuleSchema,
  errorCode: errorCodeSchema,
  message: z.string(),
  status: errorEventStatusSchema,
  assignedToUserId: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
  uniqueTenants: z.number().int().nonnegative(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});
export type ErrorEventGroup = z.infer<typeof errorEventGroupSchema>;

/** Hata grupları response. */
export const errorEventGroupListResponseSchema = z.object({
  items: z.array(errorEventGroupSchema),
  total: z.number().int().nonnegative(),
});
export type ErrorEventGroupListResponse = z.infer<
  typeof errorEventGroupListResponseSchema
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

/* --------------------------------------------------------------------------
 * GOAL-104 — Hata atama ve çözüm notları
 * --------------------------------------------------------------------------
 *
 * Aşağıdaki şemalar dosyanın sonuna konumlandırıldı; çünkü
 * yukarıdaki `errorEventSchema` ve `errorEventStatusUpdateResponseSchema`
 * gibi şemalara atıf verirler. ActorType ve Status gibi erken
 * enum'lar zaten yukarıda tanımlı.
 */

/**
 * Çözüm notunun kime görünür olduğunu belirler.
 * - `internal` : yalnızca SUPERADMIN ekibi görür (varsayılan).
 * - `shared`   : tenant SUPERADMIN'ı ile birlikte ilgili tenant'ın
 *                yönetici rolü de görebilir (kullanıcı tarafı FAZ-15+).
 *                Şu an yalnızca `internal` set'lenir; `shared` ileri
 *                goal'lerde tenant portal tarafına açılacak şekilde
 *                sözleşmeye dahil edildi.
 */
export const errorEventNoteVisibilitySchema = z.enum(["internal", "shared"]);
export type ErrorEventNoteVisibility = z.infer<
  typeof errorEventNoteVisibilitySchema
>;

/**
 * Destek kaydı (support ticket) bağlantısı harici sistemi.
 * - `jira`     : JIRA issue.
 * - `linear`   : Linear issue.
 * - `zendesk`  : Zendesk ticket.
 * - `github`   : GitHub issue/PR.
 * - `internal` : dahili takip kaydı (ID/URL olmadan).
 * - `other`    : diğer (url zorunlu).
 */
export const errorEventSupportSystemSchema = z.enum([
  "jira",
  "linear",
  "zendesk",
  "github",
  "internal",
  "other",
]);
export type ErrorEventSupportSystem = z.infer<
  typeof errorEventSupportSystemSchema
>;

/**
 * Hata olayına eklenen çözüm notu. Append-only; silinemez
 * (düzeltme yeni not ile yapılır). `authorId` istemciden alınmaz;
 * aktör bağlamından türetilir.
 */
export const errorEventNoteSchema = z.object({
  id: z.string(),
  /** Hata fingerprint (16 hex) — kayıt ile ilişki. */
  fingerprint: z.string().length(16),
  authorId: z.string().min(1).max(100),
  authorType: errorEventActorTypeSchema,
  body: z.string().min(1).max(4000),
  visibility: errorEventNoteVisibilitySchema,
  createdAt: z.string().datetime(),
});
export type ErrorEventNote = z.infer<typeof errorEventNoteSchema>;

/** Çözüm notu oluşturma girdisi. */
export const errorEventNoteCreateInputSchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: errorEventNoteVisibilitySchema.default("internal"),
});
export type ErrorEventNoteCreateInput = z.infer<
  typeof errorEventNoteCreateInputSchema
>;

/** Çözüm notu listesi response. */
export const errorEventNoteListResponseSchema = z.object({
  fingerprint: z.string().length(16),
  items: z.array(errorEventNoteSchema),
  total: z.number().int().nonnegative(),
});
export type ErrorEventNoteListResponse = z.infer<
  typeof errorEventNoteListResponseSchema
>;

/**
 * Hata olayına bağlanan destek kaydı (JIRA/Linear/Zendesk/GitHub vb.).
 * `externalId` sistem spesifikasyonuna göre opsiyonel olabilir
 * (internal için boş bırakılabilir); `url` en az biri doluysa kabul.
 */
export const errorEventSupportLinkSchema = z.object({
  id: z.string(),
  fingerprint: z.string().length(16),
  system: errorEventSupportSystemSchema,
  externalId: z.string().max(100).nullable(),
  url: z.string().url().nullable(),
  title: z.string().max(200).nullable(),
  createdById: z.string().min(1).max(100),
  createdByType: errorEventActorTypeSchema,
  createdAt: z.string().datetime(),
});
export type ErrorEventSupportLink = z.infer<
  typeof errorEventSupportLinkSchema
>;

/** Destek kaydı bağlantısı oluşturma girdisi. */
export const errorEventSupportLinkInputSchema = z
  .object({
    system: errorEventSupportSystemSchema,
    externalId: z.string().max(100).optional(),
    url: z.string().url().optional(),
    title: z.string().max(200).optional(),
  })
  .refine(
    (v) =>
      v.externalId !== undefined ||
      v.url !== undefined ||
      v.title !== undefined,
    {
      message:
        "externalId, url veya title alanlarından en az biri zorunludur",
      path: ["externalId"],
    },
  );
export type ErrorEventSupportLinkInput = z.infer<
  typeof errorEventSupportLinkInputSchema
>;

/** Destek kaydı bağlantısı listesi response. */
export const errorEventSupportLinkListResponseSchema = z.object({
  fingerprint: z.string().length(16),
  items: z.array(errorEventSupportLinkSchema),
  total: z.number().int().nonnegative(),
});
export type ErrorEventSupportLinkListResponse = z.infer<
  typeof errorEventSupportLinkListResponseSchema
>;

/**
 * Hata olayına ait atama geçmişi. Append-only; her atama yeni
 * kayıt oluşturur (iptal `unassigned` atanır). Status değişiminden
 * bağımsızdır; salt atama aksiyonu izlenir.
 */
export const errorEventAssignmentRecordSchema = z.object({
  id: z.string(),
  fingerprint: z.string().length(16),
  /** Atanan SUPERADMIN kullanıcı ID. `unassigned` özel değeri atama kaldırma anlamına gelir. */
  assigneeId: z.string().min(1).max(100),
  assignedById: z.string().min(1).max(100),
  assignedByType: errorEventActorTypeSchema,
  reason: z.string().max(1000).nullable(),
  assignedAt: z.string().datetime(),
});
export type ErrorEventAssignmentRecord = z.infer<
  typeof errorEventAssignmentRecordSchema
>;

/**
 * Atama işlem girdisi. `assigneeId` ile atama yapılır;
 * `unassign=true` ile atama kaldırılır (mevcut atamanın üzerine
 * yeni bir `unassigned` kaydı düşülür).
 */
export const errorEventAssignmentInputSchema = z
  .object({
    assigneeId: z.string().min(1).max(100).optional(),
    reason: z.string().max(1000).optional(),
    unassign: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.assigneeId) || v.unassign === true, {
    message:
      "assigneeId veya unassign=true alanlarından en az biri zorunludur",
    path: ["assigneeId"],
  });
export type ErrorEventAssignmentInput = z.infer<
  typeof errorEventAssignmentInputSchema
>;

/** Atama response (yeni atama kaydı + güncellenmiş event). */
export const errorEventAssignmentResponseSchema = z.object({
  event: errorEventSchema,
  assignment: errorEventAssignmentRecordSchema,
});
export type ErrorEventAssignmentResponse = z.infer<
  typeof errorEventAssignmentResponseSchema
>;

/** Atama listesi response. */
export const errorEventAssignmentListResponseSchema = z.object({
  fingerprint: z.string().length(16),
  items: z.array(errorEventAssignmentRecordSchema),
  total: z.number().int().nonnegative(),
});
export type ErrorEventAssignmentListResponse = z.infer<
  typeof errorEventAssignmentListResponseSchema
>;

/**
 * Audit log aksiyon tipleri. Status transitions, notlar, destek
 * bağlantıları ve atamalar aynı timeline üzerinde sıralanır.
 */
export const errorEventAuditActionSchema = z.enum([
  /** Status geçişi (resolved→reopened dahil). */
  "status_transition",
  /** Yeni çözüm notu eklendi. */
  "note_added",
  /** Yeni destek bağlantısı eklendi. */
  "support_link_added",
  /** Atama güncellendi (atama + unassign). */
  "assignment_changed",
  /** Yeni hata oluştu (resolved→reopened otomatik terfi). */
  "occurrence_recorded",
]);
export type ErrorEventAuditAction = z.infer<
  typeof errorEventAuditActionSchema
>;

/**
 * Birleşik audit entry. `details` alanı aksiyona göre farklı
 * şekil alır; UI katmanı `action` discriminator'ı ile render eder.
 */
export const errorEventAuditEntrySchema = z.object({
  id: z.string(),
  fingerprint: z.string().length(16),
  action: errorEventAuditActionSchema,
  occurredAt: z.string().datetime(),
  actorId: z.string(),
  actorType: errorEventActorTypeSchema,
  /** Aksiyon tipine göre farklı alanlar; payload serbest. */
  details: z.record(z.unknown()),
});
export type ErrorEventAuditEntry = z.infer<
  typeof errorEventAuditEntrySchema
>;

/** Birleşik audit log response. */
export const errorEventAuditLogResponseSchema = z.object({
  fingerprint: z.string().length(16),
  items: z.array(errorEventAuditEntrySchema),
  total: z.number().int().nonnegative(),
});
export type ErrorEventAuditLogResponse = z.infer<
  typeof errorEventAuditLogResponseSchema
>;
