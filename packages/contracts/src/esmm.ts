/**
 * @file e-SMM (e-Fatura/e-Arşiv/e-İrsaliye) adapter sözleşmesi.
 * @module @vetniva/contracts/esmm
 *
 * @description GOAL-077 (FAZ-7) e-SMM provider adapter sözleşmesi.
 *   Gerçek entegrasyon (GİB / özel provider) Faz 13+ kapsamında;
 *   bu sözleşme sadece interface + mock provider tanımlar. MVP
 *   kapsamında operatör manuel belge numarası girebilir.
 *
 * Belge türleri:
 * - `e_fatura`  — e-Fatura (mükellef karşı taraf).
 * - `e_arsiv`  — e-Arşiv (son tüketici).
 * - `e_irsaliye` — e-İrsaliye (sevkiyat).
 *
 * Belge durumu (status):
 * - `draft`     — operatör taslak; henüz provider'a gönderilmedi.
 * - `pending`   — adapter'a gönderildi; provider yanıtı bekleniyor.
 * - `accepted`  — provider kabul etti; belge numarası atandı.
 * - `rejected`  — provider reddetti; hata kodu + mesaj ile.
 * - `failed`    — retryable hata (ağ/timeout); operatör retry
 *   edebilir.
 * - `cancelled` — operatör/tenant iptal etti; provider'da da
 *   iptal denenir (mümkünse).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır. Retry
 *   beklentisi: aynı `idempotencyKey` ile tekrar gönderim
 *   provider tarafında aynı belgeyi üretmeli (duplicate
 *   fatura riskini ortadan kaldırır).
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

export const esmmDocumentTypeSchema = z.enum([
  "e_fatura",
  "e_arsiv",
  "e_irsaliye",
]);
export type EsmmDocumentType = z.infer<typeof esmmDocumentTypeSchema>;

export const esmmDocumentStatusSchema = z.enum([
  "draft",
  "pending",
  "accepted",
  "rejected",
  "failed",
  "cancelled",
]);
export type EsmmDocumentStatus = z.infer<typeof esmmDocumentStatusSchema>;

/* --------------------------------------------------------------------------
 * Adapter request/response (provider-agnostic)
 * -------------------------------------------------------------------------- */

/**
 * Adapter'a gönderilen belge isteği. `documentId` uygulama
 * tarafından üretilen iç id; provider tarafı yalnızca
 * `idempotencyKey` ile duplicate kontrolü yapar. `payload`
 * provider'ın anladığı serbest JSON (Faz 13'te genişletilecek).
 */
export const esmmSubmitRequestSchema = z.object({
  documentId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(1).max(200),
  type: esmmDocumentTypeSchema,
  /** Serbest provider payload (Faz 13'te Zod şeması eklenecek). */
  payload: z.record(z.string(), z.unknown()),
});
export type EsmmSubmitRequest = z.infer<typeof esmmSubmitRequestSchema>;

/**
 * Adapter yanıtı. `providerDocumentId` provider'ın atadığı id;
 * `providerDocumentNumber` operatörün/manual kayıt için kullandığı
 * belge numarası (fatura no/irsaliye no).
 */
export const esmmSubmitResponseSchema = z.object({
  status: esmmDocumentStatusSchema,
  providerDocumentId: z.string().nullable(),
  providerDocumentNumber: z.string().nullable(),
  /** Provider'a özgü mesaj (red nedeni vb.). */
  providerMessage: z.string().nullable(),
  /** ISO datetime; provider'ın yanıt zamanı. */
  respondedAt: z.string().datetime(),
});
export type EsmmSubmitResponse = z.infer<typeof esmmSubmitResponseSchema>;

/* --------------------------------------------------------------------------
 * Yerel belge kaydı (Document)
 * -------------------------------------------------------------------------- */

/**
 * Manuel belge kaydı (MVP). Operatör provider'dan bağımsız
 * olarak kendi belge numarasını girebilir.
 */
export const esmmDocumentCreateInputSchema = z.object({
  type: esmmDocumentTypeSchema,
  sourceType: z.enum(["clinic_sale", "petshop_sale"]),
  sourceId: z.string().min(1).max(100),
  /** Manuel girilen belge numarası. */
  manualDocumentNumber: z.string().min(1).max(100).optional(),
  /** Serbest payload (kalem listesi, tutar, vergi). */
  payload: z.record(z.string(), z.unknown()),
  notes: z.string().max(2000).optional(),
});
export type EsmmDocumentCreateInput = z.infer<
  typeof esmmDocumentCreateInputSchema
>;

/** Provider'a gönderim isteği. */
export const esmmSubmitDocumentInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
});
export type EsmmSubmitDocumentInput = z.infer<
  typeof esmmSubmitDocumentInputSchema
>;

/** API response şeması. */
export const esmmDocumentSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  type: esmmDocumentTypeSchema,
  sourceType: z.enum(["clinic_sale", "petshop_sale"]),
  sourceId: z.string(),
  status: esmmDocumentStatusSchema,
  providerDocumentId: z.string().nullable(),
  providerDocumentNumber: z.string().nullable(),
  providerMessage: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  manualDocumentNumber: z.string().nullable(),
  notes: z.string().nullable(),
  lastAttemptAt: z.string().datetime().nullable(),
  acceptedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type EsmmDocument = z.infer<typeof esmmDocumentSchema>;

/** Liste filtreleri. */
export const esmmDocumentFiltersSchema = z.object({
  type: esmmDocumentTypeSchema.optional(),
  status: esmmDocumentStatusSchema.optional(),
  sourceType: z.enum(["clinic_sale", "petshop_sale"]).optional(),
  sourceId: z.string().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type EsmmDocumentFilters = z.infer<typeof esmmDocumentFiltersSchema>;

/** Liste response şeması. */
export const esmmDocumentListResponseSchema = z.object({
  items: z.array(esmmDocumentSchema),
  total: z.number().int().nonnegative(),
});
export type EsmmDocumentListResponse = z.infer<
  typeof esmmDocumentListResponseSchema
>;
