/**
 * @file Klinik satış/fatura taslağı (clinic sale) API sözleşmesi.
 * @module @vetniva/contracts/clinic-sale
 *
 * @description GOAL-071 (FAZ-7) klinik satış taslağı için Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Klinik satış taslağı yaşam döngüsü:
 * - `draft`     — oluşturulmuş; satırlar/fiyatlar/indirim
 *                 düzenlenebilir.
 * - `completed` — onaylanmış; tahsilat (GOAL-072+) bekler.
 * - `cancelled` — iptal edilmiş; kaynak klinik kaydın durumu
 *                 değişmez.
 *
 * Otomatik taslak (createFromSource):
 * - Bir klinik kayıttan (muayene/aşı/lab/görüntüleme) otomatik
 *   taslak oluşturur. Her satır:
 *   - ürün (servis/medicine/vaccine/consumable)
 *   - miktar (default 1)
 *   - birim fiyat (PricingService.resolveProductPrice'dan)
 *   - indirim yüzdesi (0 default)
 *
 * Kaynak bağlamı (sourceType + sourceId):
 * - `examination`        — muayene (GOAL-040).
 * - `vaccine_application` — aşı uygulaması (GOAL-051).
 * - `lab_order`          — laboratuvar isteği (Faz 9).
 * - `imaging_order`      — görüntüleme isteği (Faz 9).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

export const clinicSaleStatusSchema = z.enum([
  "draft",
  "completed",
  "cancelled",
]);
export type ClinicSaleStatus = z.infer<typeof clinicSaleStatusSchema>;

export const clinicSaleSourceTypeSchema = z.enum([
  "examination",
  "vaccine_application",
  "lab_order",
  "imaging_order",
]);
export type ClinicSaleSourceType = z.infer<typeof clinicSaleSourceTypeSchema>;

/* --------------------------------------------------------------------------
 * Satır girdileri
 * -------------------------------------------------------------------------- */

export const clinicSaleLineInputSchema = z.object({
  productId: z.string().min(1).max(100),
  unit: z.string().min(1).max(32),
  quantity: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden decimal doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional()
    .default("1"),
  unitPrice: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden decimal doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});
export type ClinicSaleLineInput = z.infer<typeof clinicSaleLineInputSchema>;

/* --------------------------------------------------------------------------
 * Yeni taslak
 * -------------------------------------------------------------------------- */

/**
 * Yeni klinik satış taslağı.
 * - `customerOwnerId` zorunlu (sahip).
 * - `customerPatientId` zorunlu (hayvan).
 * - `sourceType` zorunlu (kaynak klinik akış türü).
 * - `sourceId` zorunlu (kaynak klinik kayıt id).
 * - `currency` zorunlu (varsayılan TRY).
 * - `lines` en az 1 satır zorunlu.
 * - `globalDiscountPercent` opsiyonel (0-100; STAFF max %5,
 *   OWNER/VETERINARIAN sınırsız — backend kontrol eder).
 * - `notes` opsiyonel.
 */
export const clinicSaleCreateInputSchema = z.object({
  customerOwnerId: z.string().uuid(),
  customerPatientId: z.string().uuid(),
  sourceType: clinicSaleSourceTypeSchema,
  sourceId: z.string().min(1).max(100),
  currency: z.string().min(3).max(3).optional().default("TRY"),
  lines: z.array(clinicSaleLineInputSchema).min(1).max(500),
  globalDiscountPercent: z.number().min(0).max(100).optional().default(0),
  notes: z.string().max(2000).optional(),
});
export type ClinicSaleCreateInput = z.infer<typeof clinicSaleCreateInputSchema>;

/** Taslak kısmi güncelleme. */
export const clinicSaleUpdateInputSchema = z
  .object({
    lines: z.array(clinicSaleLineInputSchema).min(1).max(500).optional(),
    globalDiscountPercent: z.number().min(0).max(100).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type ClinicSaleUpdateInput = z.infer<typeof clinicSaleUpdateInputSchema>;

/** İptal isteği. */
export const clinicSaleCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type ClinicSaleCancelInput = z.infer<typeof clinicSaleCancelInputSchema>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const clinicSaleLineSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  saleId: z.string(),
  productId: z.string(),
  unit: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  discountPercent: z.number(),
  /** quantity * unitPrice * (1 - discount/100) (Decimal string). */
  lineTotal: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClinicSaleLine = z.infer<typeof clinicSaleLineSchema>;

export const clinicSaleSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  status: clinicSaleStatusSchema,
  customerOwnerId: z.string().uuid(),
  customerPatientId: z.string().uuid(),
  sourceType: clinicSaleSourceTypeSchema,
  sourceId: z.string(),
  currency: z.string(),
  /** Bracket toplam: lineTotal'ların toplamı (Decimal string). */
  totalAmount: z.string(),
  globalDiscountPercent: z.number(),
  /** İndirim sonrası net tutar (Decimal string). */
  netAmount: z.string(),
  notes: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  completedBy: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type ClinicSale = z.infer<typeof clinicSaleSchema>;

export const clinicSaleDetailSchema = z.object({
  sale: clinicSaleSchema,
  lines: z.array(clinicSaleLineSchema),
});
export type ClinicSaleDetail = z.infer<typeof clinicSaleDetailSchema>;

/** Liste filtreleri. */
export const clinicSaleFiltersSchema = z.object({
  status: clinicSaleStatusSchema.optional(),
  customerOwnerId: z.string().uuid().optional(),
  customerPatientId: z.string().uuid().optional(),
  sourceType: clinicSaleSourceTypeSchema.optional(),
  sourceId: z.string().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ClinicSaleFilters = z.infer<typeof clinicSaleFiltersSchema>;

export const clinicSaleListResponseSchema = z.object({
  items: z.array(clinicSaleSchema),
  total: z.number().int().nonnegative(),
});
export type ClinicSaleListResponse = z.infer<
  typeof clinicSaleListResponseSchema
>;
