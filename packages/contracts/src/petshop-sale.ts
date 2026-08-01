/**
 * @file Petshop satış (POS) API sözleşmesi.
 * @module @vetniva/contracts/petshop-sale
 *
 * @description GOAL-064 (FAZ-6) petshop POS için Zod şemaları + tipler.
 *   Barkodlu hızlı satış akışı; sepet → tahsilat → stok düşümü.
 *
 * Satış yaşam döngüsü:
 * - `draft`     — sepet oluşturulmuş; satırlar düzenlenebilir.
 * - `completed` — tahsilat yapılmış; stok düşülmüş.
 * - `cancelled` — iptal edilmiş; tamamlanmış satışta stok iade
 *                 hareketi oluşturulur.
 *
 * Satır alanları:
 * - `productId`  : Product.id referansı.
 * - `unit`       : ProductUnit.
 * - `quantity`   : Decimal string.
 * - `unitPrice`  : Decimal string (ürün salePrice'ı veya override).
 * - `discountPercent` : 0-100 arası yüzde; rol bazlı üst sınır.
 *
 * Tahsilat:
 * - `paymentMethod` : cash | card | transfer.
 * - `paidAmount`    : Decimal string (ileride taksit için genişletilebilir).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-064 (FAZ-6) petshop POS core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

export const petshopSaleStatusSchema = z.enum([
  "draft",
  "completed",
  "cancelled",
]);
export type PetshopSaleStatus = z.infer<typeof petshopSaleStatusSchema>;

export const petshopPaymentMethodSchema = z.enum(["cash", "card", "transfer"]);
export type PetshopPaymentMethod = z.infer<typeof petshopPaymentMethodSchema>;

/* --------------------------------------------------------------------------
 * Satır girdileri
 * -------------------------------------------------------------------------- */

/**
 * Satış satırı girdisi (create/update).
 * - `productId` zorunlu (Product.id).
 * - `unit` zorunlu (ProductUnit).
 * - `quantity` zorunlu (Decimal string, > 0).
 * - `unitPrice` zorunlu (Decimal string, >= 0).
 * - `discountPercent` opsiyonel (0-100).
 * - `notes` opsiyonel.
 */
export const petshopSaleLineInputSchema = z.object({
  productId: z.string().min(1).max(100),
  unit: z.string().min(1).max(32),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden miktar doğrulamasıdır.
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz miktar"),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden fiyat doğrulamasıdır.
  unitPrice: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz fiyat"),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});
export type PetshopSaleLineInput = z.infer<typeof petshopSaleLineInputSchema>;

/* --------------------------------------------------------------------------
 * Yeni satış oluşturma (taslak)
 * -------------------------------------------------------------------------- */

/**
 * Yeni petshop satış taslağı.
 * - `lines` en az 1 satır zorunlu.
 * - `customerOwnerId` opsiyonel (sahip bağlantısı; GOAL-020).
 * - `customerPatientId` opsiyonel (hayvan bağlantısı; GOAL-021).
 * - `paymentMethod` opsiyonel (default: cash).
 * - `paidAmount` opsiyonel (Decimal string; default 0).
 * - `globalDiscountPercent` opsiyonel (sepet düzeyinde ek indirim).
 * - `notes` opsiyonel.
 */
export const petshopSaleCreateInputSchema = z.object({
  lines: z.array(petshopSaleLineInputSchema).min(1).max(500),
  customerOwnerId: z.string().uuid().optional(),
  customerPatientId: z.string().uuid().optional(),
  paymentMethod: petshopPaymentMethodSchema.optional().default("cash"),
  paidAmount: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden para tutarı doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional()
    .default("0"),
  globalDiscountPercent: z.number().min(0).max(100).optional().default(0),
  notes: z.string().max(2000).optional(),
});
export type PetshopSaleCreateInput = z.infer<
  typeof petshopSaleCreateInputSchema
>;

/** Taslak satış kısmi güncelleme. */
export const petshopSaleUpdateInputSchema = z
  .object({
    lines: z.array(petshopSaleLineInputSchema).min(1).max(500).optional(),
    customerOwnerId: z.string().uuid().nullable().optional(),
    customerPatientId: z.string().uuid().nullable().optional(),
    paymentMethod: petshopPaymentMethodSchema.optional(),
    paidAmount: z
      .string()
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden para tutarı doğrulamasıdır.
      .regex(/^\d+(\.\d{1,4})?$/)
      .optional(),
    globalDiscountPercent: z.number().min(0).max(100).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type PetshopSaleUpdateInput = z.infer<
  typeof petshopSaleUpdateInputSchema
>;

/** Tamamlama isteği (draft → completed). */
export const petshopSaleCompleteInputSchema = z.object({
  paymentMethod: petshopPaymentMethodSchema.optional(),
  paidAmount: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden para tutarı doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  notes: z.string().max(2000).optional(),
});
export type PetshopSaleCompleteInput = z.infer<
  typeof petshopSaleCompleteInputSchema
>;

/** İptal isteği. */
export const petshopSaleCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type PetshopSaleCancelInput = z.infer<
  typeof petshopSaleCancelInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const petshopSaleLineSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  saleId: z.string(),
  productId: z.string(),
  unit: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  discountPercent: z.number(),
  /** quantity * unitPrice (Decimal string) — indirim sonrası. */
  lineTotal: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PetshopSaleLine = z.infer<typeof petshopSaleLineSchema>;

export const petshopSaleSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  status: petshopSaleStatusSchema,
  customerOwnerId: z.string().nullable(),
  customerPatientId: z.string().nullable(),
  paymentMethod: petshopPaymentMethodSchema,
  paidAmount: z.string(),
  /** Bracket toplam: lineTotal'ların toplamı (Decimal string). */
  totalAmount: z.string(),
  /** Global indirim yüzdesi (sepet düzeyinde). */
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
export type PetshopSale = z.infer<typeof petshopSaleSchema>;

/** Detay yanıtı: satış + satırlar. */
export const petshopSaleDetailSchema = z.object({
  sale: petshopSaleSchema,
  lines: z.array(petshopSaleLineSchema),
});
export type PetshopSaleDetail = z.infer<typeof petshopSaleDetailSchema>;

/** Liste filtreleri. */
export const petshopSaleFiltersSchema = z.object({
  status: petshopSaleStatusSchema.optional(),
  customerOwnerId: z.string().uuid().optional(),
  customerPatientId: z.string().uuid().optional(),
  paymentMethod: petshopPaymentMethodSchema.optional(),
  /** Sıralama: createdAt desc (default) | asc. */
  sort: z.enum(["asc", "desc"]).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PetshopSaleFilters = z.infer<typeof petshopSaleFiltersSchema>;

/** Liste response şeması. */
export const petshopSaleListResponseSchema = z.object({
  items: z.array(petshopSaleSchema),
  total: z.number().int().nonnegative(),
});
export type PetshopSaleListResponse = z.infer<
  typeof petshopSaleListResponseSchema
>;
