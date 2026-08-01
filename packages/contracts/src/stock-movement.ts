/**
 * @file Stok hareketi (StockMovement) API sözleşmesi.
 * @module @vetniva/contracts/stock-movement
 *
 * @description GOAL-063 (FAZ-6) stok hareketleri ve sayım sözleşmesi.
 * Tüm stok değişiklikleri (purchase, sale, clinical_use, vaccination,
 * return, transfer, count_adjustment, waste, reversal) tek bir
 * **append-only** hareket tablosu üzerinden yönetilir. Mevcut
 * miktar, hareketlerin toplamından (`netQuantity`) türetilir.
 *
 * **Hareket tabanlı mimari:**
 * - `quantity` işaretli sayı; pozitif = stoğa giriş, negatif = çıkış.
 * - `reversesMovementId` alanı ile ters kayıt zinciri korunur (iptal).
 * - `count_adjustment` ve `reversal` için `reason` zorunlu.
 * - Lot/SKT bilgisi hareket üzerinde snapshot olarak tutulur
 *   (lot sonradan taşınsa bile geçmiş hareket değişmez).
 *
 * **Güvenlik & audit:**
 * - Tüm hareketler tenant-scoped; cross-tenant erişim 404.
 * - Audit `audit:stock_movement.create/adjust/reverse`.
 * - Hata kodları: VET-STOCK-0001-0008.
 *
 * @since GOAL-063 (FAZ-6) stok hareketleri ve sayım core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Hareket türleri
 * --------------------------------------------------------------------------
 * `purchase`           — tedarik kabul (purchase order receive veya
 *                        doğrudan manuel alış).
 * `sale`               — petshop/klinik satış çıkışı.
 * `clinical_use`       — klinik tüketim (muayene/ameliyat vb.).
 * `vaccination`        — aşı uygulaması çıkışı.
 * `return`             — müşteriden/tedarikçiden iade.
 * `transfer`           — şube/depo arası transfer.
 * `count_adjustment`   — sayım sonucu fark düzeltmesi (neden zorunlu).
 * `waste`              — miadı geçmiş/kırık/hasarlı imha (neden zorunlu).
 * `reversal`           — başka bir hareketin tersine çevrilmesi
 *                        (iptal, düzeltme; orijinal hareket
 *                        `reversesMovementId` ile bağlanır).
 */
export const stockMovementTypeSchema = z.enum([
  "purchase",
  "sale",
  "clinical_use",
  "vaccination",
  "return",
  "transfer",
  "count_adjustment",
  "waste",
  "reversal",
]);
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

/**
 * Neden zorunlu olan hareket türleri. Bu türler için API çağrısı
 * `reason` alanı olmadan reddedilir (422 VET-STOCK-0007).
 */
export const REASON_REQUIRED_MOVEMENT_TYPES: ReadonlySet<StockMovementType> =
  new Set<StockMovementType>(["count_adjustment", "waste", "reversal"]);

/* --------------------------------------------------------------------------
 * Quantity (Decimal string)
 * --------------------------------------------------------------------------
 * Pozitif: stoğa giriş; negatif: stoğa çıkış. Pilot kapsamda 4 ondalık
 * basamağa kadar desteklenir (ürün modülü ile uyumlu).
 */
export const stockMovementQuantitySchema = z
  .string()
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, isteğe bağlı eksi işareti ve en çok dört ondalık basamak kabul eden miktar doğrulamasıdır.
  .regex(/^-?\d+(\.\d{1,4})?$/, "Geçersiz miktar formatı (ör. 5 veya -3.5)")
  .refine((v) => v !== "0" && v !== "-0" && v !== "0.0" && v !== "-0.0", {
    message: "Stok hareketi sıfır olamaz",
  });
export type StockMovementQuantity = z.infer<typeof stockMovementQuantitySchema>;

/* --------------------------------------------------------------------------
 * Yeni hareket oluşturma isteği (manuel / sistem-dışı)
 * --------------------------------------------------------------------------
 * Manuel UI akışları için kullanılır. Satın alma (purchase order
 * receive) ve aşı uygulama gibi sistem akışları kendi içlerinden
 * bu sözleşmeyi kullanarak hareket oluşturur; bu endpoint pilot
 * UI'da "manuel stok düzeltmesi" ekranı için de kullanılabilir.
 *
 * - `type` zorunlu (9 türden biri).
 * - `productId` zorunlu (Product.id referansı; GOAL-060).
 * - `lotId` opsiyonel; belirtilirse lot mevcut ve arşivsiz olmalı.
 * - `quantity` zorunlu; işaretli (örn. satış: "-3", alış: "10").
 * - `unitCost` opsiyonel (alış/satış maliyet takibi; tedarik kabul).
 * - `unitPrice` opsiyonel (satış fiyat takibi).
 * - `sourceType` opsiyonel (ör. "purchase_order", "manual",
 *   "vaccine_application"); üst akış bağlantısı için.
 * - `sourceId` opsiyonel (üst kayıt ID'si).
 * - `reason` — `count_adjustment`/`waste`/`reversal` türlerinde
 *   zorunlu (422 VET-STOCK-0007).
 * - `occurredAt` opsiyonel (default: now).
 * - `notes` opsiyonel.
 */
export const stockMovementCreateInputSchema = z.object({
  type: stockMovementTypeSchema,
  productId: z.string().min(1).max(100),
  lotId: z.string().min(1).max(100).optional(),
  quantity: stockMovementQuantitySchema,
  unitCost: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden maliyet doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  unitPrice: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden fiyat doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  sourceType: z.string().min(1).max(64).optional(),
  sourceId: z.string().min(1).max(100).optional(),
  reason: z.string().min(1).max(2000).optional(),
  occurredAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type StockMovementCreateInput = z.infer<
  typeof stockMovementCreateInputSchema
>;

/* --------------------------------------------------------------------------
 * Hareket iptal / ters kayıt isteği
 * --------------------------------------------------------------------------
 * Mevcut bir hareketin ters kayıt olarak yeni bir `reversal`
 * hareketi oluşturur. Orijinal hareketin miktarı tersine çevrilir
 * ve `reversesMovementId` ile bağlanır. Pilot kapsamda yalnızca
 * aynı tenant içinde ve son 24 saat içinde ters kayıt alınır
 * (eski hareketler için düzeltme amaçlı yeni `count_adjustment`
 * kullanılmalıdır; audit bütünlüğü korunur).
 *
 * - `reason` zorunlu (422 VET-STOCK-0008).
 */
export const stockMovementReverseInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type StockMovementReverseInput = z.infer<
  typeof stockMovementReverseInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şeması
 * --------------------------------------------------------------------------
 * Public response. `quantity` işaretli; UI'da yön oku ile gösterilir.
 * `reversesMovementId` reversal hareketlerinde orijinal hareket
 * ID'sini taşır; diğer türlerde null.
 */
export const stockMovementSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  type: stockMovementTypeSchema,
  productId: z.string(),
  lotId: z.string().nullable(),
  /** İşaretli miktar (Decimal string). Pozitif = giriş, negatif = çıkış. */
  quantity: z.string(),
  unitCost: z.string().nullable(),
  unitPrice: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  reversesMovementId: z.string().nullable(),
  reason: z.string().nullable(),
  occurredAt: z.string().datetime(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

/** Lot/ürün için hesaplanmış bakiye. `netQuantity` pozitif ise stok var. */
export const stockBalanceSchema = z.object({
  productId: z.string(),
  lotId: z.string().nullable(),
  netQuantity: z.string(),
  movementCount: z.number().int().nonnegative(),
});
export type StockBalance = z.infer<typeof stockBalanceSchema>;

/* --------------------------------------------------------------------------
 * Liste filtreleri
 * --------------------------------------------------------------------------
 * Tenant-scoped arama; `productId`/`lotId`/`type`/`types`/
 * `sourceType`/`sourceId`/`occurredFrom`/`occurredTo`/`search`
 * (notes içinde arar) + pagination.
 */
export const stockMovementFiltersSchema = z.object({
  productId: z.string().optional(),
  lotId: z.string().optional(),
  type: stockMovementTypeSchema.optional(),
  types: z.preprocess(
    (v) =>
      typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : Array.isArray(v)
          ? v
          : undefined,
    z.array(stockMovementTypeSchema).min(1).max(9).optional(),
  ),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  occurredFrom: z.string().datetime().optional(),
  occurredTo: z.string().datetime().optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type StockMovementFilters = z.infer<typeof stockMovementFiltersSchema>;

/** Liste response şeması. */
export const stockMovementListResponseSchema = z.object({
  items: z.array(stockMovementSchema),
  total: z.number().int().nonnegative(),
});
export type StockMovementListResponse = z.infer<
  typeof stockMovementListResponseSchema
>;

/** Bakiye listesi (ürün veya lot bazında). */
export const stockBalanceListResponseSchema = z.object({
  items: z.array(stockBalanceSchema),
});
export type StockBalanceListResponse = z.infer<
  typeof stockBalanceListResponseSchema
>;
