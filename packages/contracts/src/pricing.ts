/**
 * @file Fiyat listeleri ve hizmet ücretleri API sözleşmesi.
 * @module @vetniva/contracts/pricing
 *
 * @description GOAL-070 (FAZ-7) tenant bazlı fiyat listesi altyapısı için
 * Zod şemaları + tipler. Backend (request/response doğrulama) ve frontend
 * (form/typing) aynı kaynaktan tüketir.
 *
 * Fiyat listesi kavramı (PriceList + PriceListItem):
 * - **PriceList**: fiyat listesi başlığı. Tür, currency, vergi profili,
 *   tarih aralığı, müşteri kapsamı.
 * - **PriceListItem**: ürün/hizmet başına fiyat satırı. Append-only:
 *   düzeltme yeni satır oluşturur, eski satır `superseded` olur
 *   (klinik + finansal kayıt politikası).
 *
 * Türler (PriceListType):
 * - `standard`          — standart fiyat listesi (tüm müşteriler).
 * - `promotional`       — kampanya / dönemsel fiyat listesi.
 * - `customer_specific` — müşteriye özel fiyat listesi (customerId zorunlu).
 *
 * Liste durumu (PriceListStatus):
 * - `draft`     — taslak; içerik değiştirilebilir.
 * - `active`    — aktif; ürün/hizmet fiyatı bu listeden çözümlenebilir.
 * - `expired`   — süresi dolmuş (validUntil geçmiş); yeni fiyat çözümlemez.
 * - `archived`  — arşivlenmiş (soft delete).
 *
 * Satır durumu (PriceListItemStatus):
 * - `active`     — güncel fiyat.
 * - `superseded` — düzeltildi; yerine yeni satır oluşturuldu.
 * - `cancelled`  — manuel iptal.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri core
 */

import { z } from "zod";

import { productCurrencySchema, productTaxProfileSchema } from "./product.js";

/** Para birimi (Product ile aynı). */
export const pricingCurrencySchema = productCurrencySchema;
export type PricingCurrency = z.infer<typeof pricingCurrencySchema>;

/** Vergi profili (Product ile aynı). */
export const pricingTaxProfileSchema = productTaxProfileSchema;
export type PricingTaxProfile = z.infer<typeof pricingTaxProfileSchema>;

/** Fiyat listesi türü. */
export const priceListTypeSchema = z.enum([
  "standard",
  "promotional",
  "customer_specific",
]);
export type PriceListType = z.infer<typeof priceListTypeSchema>;

/** Fiyat listesi durumu. */
export const priceListStatusSchema = z.enum([
  "draft",
  "active",
  "expired",
  "archived",
]);
export type PriceListStatus = z.infer<typeof priceListStatusSchema>;

/** Fiyat satırı durumu. */
export const priceListItemStatusSchema = z.enum([
  "active",
  "superseded",
  "cancelled",
]);
export type PriceListItemStatus = z.infer<typeof priceListItemStatusSchema>;

/**
 * Yeni fiyat listesi oluşturma isteği.
 * - `name` zorunlu (görünen ad).
 * - `type` zorunlu (standard/promotional/customer_specific).
 * - `customerId` yalnızca `type=customer_specific` için zorunlu.
 * - `currency` zorunlu (default "TRY").
 * - `taxProfile` opsiyonel (liste varsayılan vergi profili; satırda override edilebilir).
 * - `validFrom` opsiyonel (ISO datetime; null ise başlangıç yok).
 * - `validUntil` opsiyonel (ISO datetime; null ise bitiş yok).
 */
export const priceListCreateInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    type: priceListTypeSchema,
    customerId: z.string().uuid().optional(),
    currency: pricingCurrencySchema.optional().default("TRY"),
    taxProfile: pricingTaxProfileSchema.optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
  })
  .refine(
    (v) =>
      v.type !== "customer_specific" ||
      (v.customerId !== undefined && v.customerId.length > 0),
    {
      message: "type='customer_specific' için customerId zorunludur",
      path: ["customerId"],
    },
  )
  .refine((v) => v.type === "customer_specific" || v.customerId === undefined, {
    message: "customerId yalnızca type='customer_specific' için kullanılabilir",
    path: ["customerId"],
  })
  .refine(
    (v) =>
      v.validFrom === undefined ||
      v.validUntil === undefined ||
      new Date(v.validFrom).getTime() <= new Date(v.validUntil).getTime(),
    {
      message: "validFrom, validUntil'den büyük olamaz",
      path: ["validUntil"],
    },
  );
export type PriceListCreateInput = z.infer<typeof priceListCreateInputSchema>;

/**
 * Fiyat listesi kısmi güncelleme isteği. Yalnızca `status='draft'`
 * iken güncellenebilir; aktif/expiry/archived listelerde değişiklik
 * reddedilir (VET-PRICING-0006).
 */
export const priceListUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    taxProfile: pricingTaxProfileSchema.nullable().optional(),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime().nullable().optional(),
  })
  .refine(
    (v) =>
      v.validFrom === undefined ||
      v.validFrom === null ||
      v.validUntil === undefined ||
      v.validUntil === null ||
      new Date(v.validFrom).getTime() <= new Date(v.validUntil).getTime(),
    {
      message: "validFrom, validUntil'den büyük olamaz",
      path: ["validUntil"],
    },
  )
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type PriceListUpdateInput = z.infer<typeof priceListUpdateInputSchema>;

/** Fiyat listesi API response şeması. */
export const priceListSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  type: priceListTypeSchema,
  customerId: z.string().uuid().nullable(),
  currency: pricingCurrencySchema,
  taxProfile: pricingTaxProfileSchema.nullable(),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  status: priceListStatusSchema,
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  archivedBy: z.string().nullable(),
  archiveReason: z.string().nullable(),
});
export type PriceList = z.infer<typeof priceListSchema>;

/** Fiyat listesi liste filtreleri. */
export const priceListFiltersSchema = z.object({
  type: priceListTypeSchema.optional(),
  status: priceListStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  /** Tarih (ISO datetime) belirtilirse o tarihte geçerli olan listeler döner. */
  effectiveAt: z.string().datetime().optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PriceListFilters = z.infer<typeof priceListFiltersSchema>;

/** Liste response şeması. */
export const priceListListResponseSchema = z.object({
  items: z.array(priceListSchema),
  total: z.number().int().nonnegative(),
});
export type PriceListListResponse = z.infer<typeof priceListListResponseSchema>;

/** Arşivleme isteği. */
export const priceListArchiveInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type PriceListArchiveInput = z.infer<typeof priceListArchiveInputSchema>;

/** Fiyat listesi aktifleştirme isteği. */
export const priceListActivateInputSchema = z.object({});
export type PriceListActivateInput = z.infer<
  typeof priceListActivateInputSchema
>;

// ---------------------------------------------------------------------------
// PriceListItem
// ---------------------------------------------------------------------------

/**
 * Fiyat satırı oluşturma isteği.
 * - `productId` zorunlu (ürün kataloğuna referans).
 * - `price` zorunlu (Decimal string, 4 ondalık hassasiyet).
 * - `taxProfile` opsiyonel (listeden inherit; override edilebilir).
 * - `validFrom`/`validUntil` opsiyonel (item-level tarih aralığı).
 */
export const priceListItemCreateInputSchema = z.object({
  productId: z.string().uuid(),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden fiyat doğrulamasıdır.
  price: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz fiyat formatı"),
  taxProfile: pricingTaxProfileSchema.optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type PriceListItemCreateInput = z.infer<
  typeof priceListItemCreateInputSchema
>;

/**
 * Fiyat satırı düzeltme isteği. Append-only: yeni satır oluşturur,
 * eski satır `superseded` yapılır. Yalnızca `status='active'` satırlar
 * düzeltilebilir.
 */
export const priceListItemUpdateInputSchema = z
  .object({
    price: z
      .string()
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden fiyat doğrulamasıdır.
      .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz fiyat formatı")
      .optional(),
    taxProfile: pricingTaxProfileSchema.nullable().optional(),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type PriceListItemUpdateInput = z.infer<
  typeof priceListItemUpdateInputSchema
>;

/** Fiyat satırı API response şeması. */
export const priceListItemSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  priceListId: z.string(),
  productId: z.string().uuid(),
  /** Decimal string (en fazla 4 ondalık). */
  price: z.string(),
  taxProfile: pricingTaxProfileSchema.nullable(),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  status: priceListItemStatusSchema,
  /** Bu satırın yerine geçtiği önceki satır (append-only zincir). */
  supersedesId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type PriceListItem = z.infer<typeof priceListItemSchema>;

/** Fiyat satırı liste filtreleri. */
export const priceListItemFiltersSchema = z.object({
  productId: z.string().uuid().optional(),
  status: priceListItemStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PriceListItemFilters = z.infer<typeof priceListItemFiltersSchema>;

/** Fiyat satırı liste response şeması. */
export const priceListItemListResponseSchema = z.object({
  items: z.array(priceListItemSchema),
  total: z.number().int().nonnegative(),
});
export type PriceListItemListResponse = z.infer<
  typeof priceListItemListResponseSchema
>;

/**
 * Ürün için geçerli fiyat çözümleme response şeması. Birden
 * fazla aday dönebilir; resolver tarafından önceliklendirilir
 * (customer_specific > promotional > standard).
 */
export const productPriceResolutionSchema = z.object({
  productId: z.string().uuid(),
  resolvedAt: z.string().datetime(),
  candidates: z.array(
    z.object({
      priceListId: z.string(),
      priceListName: z.string(),
      priceListType: priceListTypeSchema,
      itemId: z.string(),
      price: z.string(),
      taxProfile: pricingTaxProfileSchema.nullable(),
      validFrom: z.string().datetime().nullable(),
      validUntil: z.string().datetime().nullable(),
    }),
  ),
});
export type ProductPriceResolution = z.infer<
  typeof productPriceResolutionSchema
>;

/** Tüm pricing şemaları için ortak export. */
export const pricingSchemas = {
  priceListType: priceListTypeSchema,
  priceListStatus: priceListStatusSchema,
  priceListItemStatus: priceListItemStatusSchema,
  create: priceListCreateInputSchema,
  update: priceListUpdateInputSchema,
  archive: priceListArchiveInputSchema,
  activate: priceListActivateInputSchema,
  list: priceListListResponseSchema,
  itemCreate: priceListItemCreateInputSchema,
  itemUpdate: priceListItemUpdateInputSchema,
  itemList: priceListItemListResponseSchema,
  resolution: productPriceResolutionSchema,
} as const;
