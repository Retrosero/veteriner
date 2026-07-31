/**
 * @file Cihaz ve dış laboratuvar adapter sözleşmesi.
 * @module @vetniva/contracts/lab-adapter
 *
 * @description GOAL-094 (FAZ-9) tenant bazlı laboratuvar adapter
 *   sözleşmesi. Klinik içi cihazlara (kan sayım cihazı, biyokimya
 *   analizörü vb.) ve dış laboratuvarlara order export + result
 *   import için provider-agnostic arayüz.
 *
 *   Gerçek provider entegrasyonu Faz 13+ kapsamında; bu sözleşme
 *   sadece interface + mock implementasyonları tanımlar.
 *
 * Adapter türleri:
 * - `in_clinic_device` — Klinik içi cihaz (ör. hemogram cihazı).
 *   Result import çoğunlukla otomatik/senkron; export yine de
 *   idempotent bir kayıt açar.
 * - `external_lab` — Dış laboratuvar (ör. referans lab).
 *   Order export edilir, dış lab sonucu import eder.
 *
 * Export durumu (status):
 * - `pending`    — adapter'a gönderildi; provider yanıtı bekleniyor.
 * - `accepted`   — adapter kabul etti; providerReference atandı.
 * - `rejected`   — adapter reddetti; `lastError` ile.
 * - `failed`     — retryable hata (ağ/timeout); operatör retry edebilir.
 * - `cancelled`  — operatör iptal etti; tekrar denenemez.
 *
 * Import durumu (status):
 * - `received`   — adapter sonucu aldı; henüz doğrulanmadı.
 * - `applied`    — sonuç labResult'a uygulandı.
 * - `rejected`   — sonuç reddedildi (mapping hatası vb.).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır. Retry beklentisi:
 *   aynı `idempotencyKey` ile tekrar export adapter tarafında aynı
 *   provider kaydını üretmeli (duplicate order riskini ortadan
 *   kaldırır).
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Adapter türü. */
export const labAdapterTypeSchema = z.enum([
  "in_clinic_device",
  "external_lab",
]);
export type LabAdapterType = z.infer<typeof labAdapterTypeSchema>;

/** Export durum makinesi. */
export const labAdapterExportStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "failed",
  "cancelled",
]);
export type LabAdapterExportStatus = z.infer<
  typeof labAdapterExportStatusSchema
>;

/** Import durum makinesi. */
export const labAdapterImportStatusSchema = z.enum([
  "received",
  "applied",
  "rejected",
]);
export type LabAdapterImportStatus = z.infer<
  typeof labAdapterImportStatusSchema
>;

/* --------------------------------------------------------------------------
 * Adapter request/response (provider-agnostic)
 * --------------------------------------------------------------------------
 */

/**
 * Adapter'a gönderilen order export isteği. `orderId` uygulama
 * tarafından üretilen iç id; adapter tarafı yalnızca
 * `idempotencyKey` ile duplicate kontrolü yapar. `payload`
 * adapter'ın anladığı serbest JSON (cihaz/lab formatı; Faz 13'te
 * Zod şeması eklenecek).
 */
export const labAdapterExportRequestSchema = z.object({
  orderId: z.string().min(1).max(100),
  labOrderId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(1).max(200),
  adapterType: labAdapterTypeSchema,
  /**
   * Serbest provider payload. MVP'de:
   * - patient bilgisi (kısaltılmış; PII mask'li)
   * - test kodu + adı + birim + referans aralığı
   * - order önceliği + sourceType
   */
  payload: z.record(z.string(), z.unknown()),
});
export type LabAdapterExportRequest = z.infer<
  typeof labAdapterExportRequestSchema
>;

/**
 * Adapter'dan dönen export yanıtı. `providerReference` provider'ın
 * atadığı dış referans (ör. dış lab'ın kayıt no). `rawResponse`
 * provider'ın ham yanıtı (debug/audit için).
 */
export const labAdapterExportResponseSchema = z.object({
  status: labAdapterExportStatusSchema,
  providerReference: z.string().nullable(),
  providerMessage: z.string().nullable(),
  rawResponse: z.record(z.string(), z.unknown()).nullable(),
  respondedAt: z.string().datetime(),
});
export type LabAdapterExportResponse = z.infer<
  typeof labAdapterExportResponseSchema
>;

/**
 * Adapter'dan import edilen sonuç. `rawPayload` provider'ın ham
 * verisi; mapping katmanı (mock için built-in) bunu LabResult
 * şemasına dönüştürür.
 */
export const labAdapterImportResultSchema = z.object({
  providerReference: z.string().min(1).max(200),
  receivedAt: z.string().datetime(),
  rawPayload: z.record(z.string(), z.unknown()),
});
export type LabAdapterImportResult = z.infer<
  typeof labAdapterImportResultSchema
>;

/* --------------------------------------------------------------------------
 * Adapter interface (sözleşme)
 * --------------------------------------------------------------------------
 */

/**
 * Lab adapter interface. Mock implementasyonlar:
 * - `MockLabDeviceAdapter` — in_clinic_device için
 * - `MockExternalLabAdapter` — external_lab için
 *
 * Gerçek provider (ör. Idexx/Heska/Reflab) Faz 13+'da bu interface'i
 * implemente eder.
 */
export const labAdapterInfoSchema = z.object({
  type: labAdapterTypeSchema,
  providerName: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  enabled: z.boolean(),
});
export type LabAdapterInfo = z.infer<typeof labAdapterInfoSchema>;

/* --------------------------------------------------------------------------
 * Export kaydı (yerel ledger)
 * --------------------------------------------------------------------------
 */

/** Yeni export denemesi başlatma. */
export const labAdapterExportCreateInputSchema = z.object({
  adapterType: labAdapterTypeSchema,
  idempotencyKey: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  /**
   * Test/ops amaçlı: adapter'ın hatalı yanıt simüle etmesini
   * tetikler. Mock adapter'lar için kullanılır; gerçek
   * provider'lar görmezden gelir.
   */
  simulateFailure: z.boolean().optional().default(false),
});
export type LabAdapterExportCreateInput = z.infer<
  typeof labAdapterExportCreateInputSchema
>;

/** Export kaydı. */
export const labAdapterExportSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  labOrderId: z.string(),
  adapterType: labAdapterTypeSchema,
  providerName: z.string(),
  status: labAdapterExportStatusSchema,
  idempotencyKey: z.string(),
  providerReference: z.string().nullable(),
  providerMessage: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  lastAttemptAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type LabAdapterExport = z.infer<typeof labAdapterExportSchema>;

/** Export listesi filtreleri. */
export const labAdapterExportFiltersSchema = z.object({
  labOrderId: z.string().optional(),
  adapterType: labAdapterTypeSchema.optional(),
  status: labAdapterExportStatusSchema.optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type LabAdapterExportFilters = z.infer<
  typeof labAdapterExportFiltersSchema
>;

export const labAdapterExportListResponseSchema = z.object({
  items: z.array(labAdapterExportSchema),
  total: z.number().int().nonnegative(),
});
export type LabAdapterExportListResponse = z.infer<
  typeof labAdapterExportListResponseSchema
>;

/** Export iptal isteği. */
export const labAdapterExportCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type LabAdapterExportCancelInput = z.infer<
  typeof labAdapterExportCancelInputSchema
>;

/* --------------------------------------------------------------------------
 * Import kaydı (yerel ledger)
 * --------------------------------------------------------------------------
 */

/** Manuel import tetikleyici. Mock için `simulate` bayrağı ile. */
export const labAdapterImportCreateInputSchema = z.object({
  adapterType: labAdapterTypeSchema,
  providerReference: z.string().min(1).max(200),
  /** Mock adapter için: eğer verilirse adapter bu payload ile
   * "sonuç geldi" simülasyonu yapar; verilmezse adapter kendi
   * dahili veri kaynağından (mock map) sonuç üretir. */
  simulatePayload: z.record(z.string(), z.unknown()).optional(),
});
export type LabAdapterImportCreateInput = z.infer<
  typeof labAdapterImportCreateInputSchema
>;

/** Import kaydı. */
export const labAdapterImportSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  labOrderId: z.string(),
  adapterType: labAdapterTypeSchema,
  providerName: z.string(),
  status: labAdapterImportStatusSchema,
  providerReference: z.string(),
  rawPayload: z.record(z.string(), z.unknown()),
  mappedResultId: z.string().nullable(),
  mappedAt: z.string().datetime().nullable(),
  mappedBy: z.string().nullable(),
  errorMessage: z.string().nullable(),
  receivedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LabAdapterImport = z.infer<typeof labAdapterImportSchema>;

/** Import listesi filtreleri. */
export const labAdapterImportFiltersSchema = z.object({
  labOrderId: z.string().optional(),
  adapterType: labAdapterTypeSchema.optional(),
  status: labAdapterImportStatusSchema.optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type LabAdapterImportFilters = z.infer<
  typeof labAdapterImportFiltersSchema
>;

export const labAdapterImportListResponseSchema = z.object({
  items: z.array(labAdapterImportSchema),
  total: z.number().int().nonnegative(),
});
export type LabAdapterImportListResponse = z.infer<
  typeof labAdapterImportListResponseSchema
>;
