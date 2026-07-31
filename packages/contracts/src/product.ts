/**
 * @file Ürün ve hizmet kataloğu API sözleşmesi.
 * @module @vetniva/contracts/product
 *
 * @description GOAL-060 (FAZ-6) ürün ve hizmet kataloğu için Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Katalog türleri (ProductKind):
 * - `stock_product` — fiziksel stoklanan genel ürün (petshop/klinik).
 * - `medicine`      — ilaç; klinik reçete girdisi.
 * - `vaccine`       — aşı; Faz 5 vaccine protokolüne referans.
 * - `service`       — hizmet (muayene, aşı uygulaması, ameliyat).
 * - `consumable`    — klinik tüketim malzemesi (eldiven, iğne, gazlı bez).
 *
 * `vaccine` türü için Faz 5 `vaccineProtocolId` ile referans tutulur;
 * Faz 5 kendi kataloğunu yönetir, Faz 6'da katalog ile bağlamak için
 * referans kullanılır (decoupled).
 *
 * Diğer ürün/hizmet türleri (stock_product, medicine, consumable,
 * service) klinik + petshop ortak satılabilir; bu nedenle
 * `clinicUsage` + `petshopUsage` alanları her ikisinde de yer alır.
 *
 * Vergi profili (TaxProfile):
 * - `none`, `standard`, `reduced`, `zero`, `exempt`.
 * - Ülke adaptörü (TR/GB) ile eşleme Faz 7'de yapılacak.
 *
 * Satış/alış (SaleChannel / PurchaseChannel):
 * - `saleAvailable`   : POS / reçete ile satışa açık mı.
 * - `purchaseTracked` : tedarik alımı takip edilsin mi.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core
 */

import { z } from "zod";

/** Katalog türü. */
export const productKindSchema = z.enum([
  "stock_product",
  "medicine",
  "vaccine",
  "service",
  "consumable",
]);
export type ProductKind = z.infer<typeof productKindSchema>;

/** Birim (Unit). Kilo, adet, mililitre vb. listesi. */
export const productUnitSchema = z.enum([
  "unit", // adet
  "kg", // kilogram
  "g", // gram
  "mg", // miligram
  "ml", // mililitre
  "l", // litre
  "dose", // doz (aşı/ilaç)
  "tablet", // tablet
  "capsule", // kapsül
  "box", // kutu
  "pack", // paket
]);
export type ProductUnit = z.infer<typeof productUnitSchema>;

/** Vergi profili (tax profile). */
export const productTaxProfileSchema = z.enum([
  "none",
  "standard",
  "reduced",
  "zero",
  "exempt",
]);
export type ProductTaxProfile = z.infer<typeof productTaxProfileSchema>;

/** Para birimi. */
export const productCurrencySchema = z.enum(["TRY", "GBP", "USD", "EUR"]);
export type ProductCurrency = z.infer<typeof productCurrencySchema>;

/**
 * Yeni ürün/hizmet oluşturma isteği.
 * - `kind` zorunlu (catalog türü).
 * - `sku` opsiyonel; otomatik üretilebilir.
 * - `barcode` opsiyonel (barkod).
 * - `name` zorunlu (görünen ad).
 * - `category` opsiyonel serbest kategori.
 * - `unit` zorunlu (default birim).
 * - `taxProfile` zorunlu (vergi profili).
 * - `purchasePrice` / `salePrice` opsiyonel (Decimal string).
 * - `currency` opsiyonel (default "TRY").
 * - `costCurrency` / `saleCurrency` yerine tek `currency` kullanılır
 *   (Faz 7'de ülke adaptörü ile eşleme).
 * - `clinicUsage` / `petshopUsage` boolean (default true).
 * - `vaccineProtocolId` yalnızca `kind=vaccine` için opsiyonel
 *   referans (Faz 5).
 * - `requiresPrescription` yalnızca `kind=medicine` için boolean.
 * - `controlledDrug` opsiyonel boolean (kontrollü ilaç; UK için).
 * - `notes` opsiyonel serbest not.
 */
export const productCreateInputSchema = z
  .object({
    kind: productKindSchema,
    sku: z.string().min(1).max(64).optional(),
    barcode: z.string().min(1).max(64).optional(),
    name: z.string().min(1).max(200),
    category: z.string().max(100).optional(),
    unit: productUnitSchema,
    taxProfile: productTaxProfileSchema,
    purchasePrice: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
    salePrice: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
    currency: productCurrencySchema.optional().default("TRY"),
    clinicUsage: z.boolean().optional().default(true),
    petshopUsage: z.boolean().optional().default(false),
    saleAvailable: z.boolean().optional().default(true),
    purchaseTracked: z.boolean().optional().default(true),
    vaccineProtocolId: z.string().min(1).max(100).optional(),
    requiresPrescription: z.boolean().optional().default(false),
    controlledDrug: z.boolean().optional().default(false),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.kind !== "vaccine" || v.vaccineProtocolId === undefined ||
      v.vaccineProtocolId.length > 0,
    {
      message:
        "vaccineProtocolId yalnızca kind='vaccine' için tanımlı olabilir",
      path: ["vaccineProtocolId"],
    },
  );
export type ProductCreateInput = z.infer<typeof productCreateInputSchema>;

/**
 * Ürün/hizmet kısmi güncelleme isteği. Yalnızca set edilen
 * alanlar değişir. `kind` değiştirilemez (tür değişikliği yeni
 * kayıt ile yapılır).
 */
export const productUpdateInputSchema = z
  .object({
    sku: z.string().min(1).max(64).optional(),
    barcode: z.string().min(1).max(64).nullable().optional(),
    name: z.string().min(1).max(200).optional(),
    category: z.string().max(100).nullable().optional(),
    unit: productUnitSchema.optional(),
    taxProfile: productTaxProfileSchema.optional(),
    purchasePrice: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .nullable()
      .optional(),
    salePrice: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .nullable()
      .optional(),
    currency: productCurrencySchema.optional(),
    clinicUsage: z.boolean().optional(),
    petshopUsage: z.boolean().optional(),
    saleAvailable: z.boolean().optional(),
    purchaseTracked: z.boolean().optional(),
    requiresPrescription: z.boolean().optional(),
    controlledDrug: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (v) => Object.keys(v).length > 0,
    { message: "En az bir alan gönderilmelidir" },
  );
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;

/** API response şeması. */
export const productSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  kind: productKindSchema,
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  name: z.string(),
  category: z.string().nullable(),
  unit: productUnitSchema,
  taxProfile: productTaxProfileSchema,
  purchasePrice: z.string().nullable(),
  salePrice: z.string().nullable(),
  currency: productCurrencySchema,
  clinicUsage: z.boolean(),
  petshopUsage: z.boolean(),
  saleAvailable: z.boolean(),
  purchaseTracked: z.boolean(),
  vaccineProtocolId: z.string().nullable(),
  requiresPrescription: z.boolean(),
  controlledDrug: z.boolean(),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  archivedBy: z.string().nullable(),
  archiveReason: z.string().nullable(),
});
export type Product = z.infer<typeof productSchema>;

/** Liste filtreleri. */
export const productFiltersSchema = z.object({
  kind: productKindSchema.optional(),
  /** Tür listesi (OR). */
  kinds: z
    .array(productKindSchema)
    .optional(),
  clinicUsage: z.coerce.boolean().optional(),
  petshopUsage: z.coerce.boolean().optional(),
  /** Serbest metin araması (sku/barcode/name/category). */
  search: z.string().min(1).max(200).optional(),
  active: z.coerce.boolean().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ProductFilters = z.infer<typeof productFiltersSchema>;

/** Liste response şeması. */
export const productListResponseSchema = z.object({
  items: z.array(productSchema),
  total: z.number().int().nonnegative(),
});
export type ProductListResponse = z.infer<typeof productListResponseSchema>;

/** Arşivleme isteği. */
export const productArchiveInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type ProductArchiveInput = z.infer<
  typeof productArchiveInputSchema
>;
