/**
 * @file Klinik tüketim (clinical usage) API sözleşmesi.
 * @module @vetniva/contracts/clinical-usage
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü için Zod şemaları + tipler. Muayene, aşı, ameliyat,
 * yatış gibi klinik akışlar bu servisi çağırarak kullanılan ürün
 * miktarını `type=clinical_use` hareketi olarak kaydeder.
 *
 * Kaynak bağlamı (sourceType + sourceId):
 * - `examination`  — muayene (GOAL-040).
 * - `vaccine_application` — aşı uygulaması (GOAL-051).
 * - `surgery`       — ameliyat (GOAL-080+).
 * - `hospitalization` — yatış (GOAL-084+).
 * - `prescription`  — reçete dispense (GOAL-045).
 *
 * Idempotency:
 * - `idempotencyKey` opsiyonel. Aynı key ile 2. çağrıda yeni
 *   kayıt oluşturulmaz, mevcut kayıt döner. Bu sayede klinik
 *   akışlar (özellikle aşı uygulaması) güvenle retry
 *   yapabilir.
 *
 * Lot referansı (Faz 6 ileride):
 * - `lotId` opsiyonel. Verildiyse stock-movements `lotId` ile
 *   eşleşir. `null` bırakılırsa FIFO (Faz 6 ileride).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

/** Tüketim kaynağı türü. */
export const clinicalUsageSourceTypeSchema = z.enum([
  "examination",
  "vaccine_application",
  "surgery",
  "hospitalization",
  "prescription",
]);
export type ClinicalUsageSourceType = z.infer<
  typeof clinicalUsageSourceTypeSchema
>;

/* --------------------------------------------------------------------------
 * Satır girdisi
 * -------------------------------------------------------------------------- */

/**
 * Tüketim satırı girdisi.
 * - `productId` zorunlu (Product.id).
 * - `unit` zorunlu (ProductUnit).
 * - `quantity` zorunlu (Decimal string, > 0).
 * - `lotId` opsiyonel (lot belirtilen akışlarda).
 * - `notes` opsiyonel.
 */
export const clinicalUsageLineInputSchema = z.object({
  productId: z.string().min(1).max(100),
  unit: z.string().min(1).max(32),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden decimal doğrulamasıdır.
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz miktar"),
  lotId: z.string().min(1).max(100).optional(),
  notes: z.string().max(2000).optional(),
});
export type ClinicalUsageLineInput = z.infer<
  typeof clinicalUsageLineInputSchema
>;

/* --------------------------------------------------------------------------
 * Tüketim kaydı oluşturma
 * -------------------------------------------------------------------------- */

/**
 * Yeni klinik tüketim kaydı.
 * - `sourceType` zorunlu (hangi klinik akış oluşturdu).
 * - `sourceId` zorunlu (ilgili kayıt id; ör. examinationId).
 * - `lines` en az 1 satır zorunlu.
 * - `idempotencyKey` opsiyonel (aynı key ile ikinci çağrıda
 *   mevcut kayıt döner; 409 VET-CLINICAL-USE-0005 farklı body ile).
 * - `notes` opsiyonel.
 */
export const clinicalUsageCreateInputSchema = z.object({
  sourceType: clinicalUsageSourceTypeSchema,
  sourceId: z.string().min(1).max(100),
  lines: z.array(clinicalUsageLineInputSchema).min(1).max(500),
  idempotencyKey: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
});
export type ClinicalUsageCreateInput = z.infer<
  typeof clinicalUsageCreateInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const clinicalUsageLineSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  usageId: z.string(),
  productId: z.string(),
  unit: z.string(),
  quantity: z.string(),
  lotId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ClinicalUsageLine = z.infer<typeof clinicalUsageLineSchema>;

export const clinicalUsageSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  sourceType: clinicalUsageSourceTypeSchema,
  sourceId: z.string(),
  idempotencyKey: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type ClinicalUsage = z.infer<typeof clinicalUsageSchema>;

/** Detay yanıtı: usage + satırlar. */
export const clinicalUsageDetailSchema = z.object({
  usage: clinicalUsageSchema,
  lines: z.array(clinicalUsageLineSchema),
});
export type ClinicalUsageDetail = z.infer<typeof clinicalUsageDetailSchema>;

/** Liste filtreleri. */
export const clinicalUsageFiltersSchema = z.object({
  sourceType: clinicalUsageSourceTypeSchema.optional(),
  sourceId: z.string().optional(),
  /** Sıralama: createdAt desc (default) | asc. */
  sort: z.enum(["asc", "desc"]).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ClinicalUsageFilters = z.infer<typeof clinicalUsageFiltersSchema>;

/** Liste response şeması. */
export const clinicalUsageListResponseSchema = z.object({
  items: z.array(clinicalUsageSchema),
  total: z.number().int().nonnegative(),
});
export type ClinicalUsageListResponse = z.infer<
  typeof clinicalUsageListResponseSchema
>;
