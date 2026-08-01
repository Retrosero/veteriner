/**
 * @file Satın alma siparişi (purchase order) API sözleşmesi.
 * @module @vetniva/contracts/purchase-order
 *
 * @description GOAL-062 (FAZ-6) satın alma siparişi ve mal kabul için
 * Zod şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Satın alma siparişi yaşam döngüsü:
 * - `draft`     — henüz onaylanmamış taslak; satırlar/fiyatlar
 *                 düzenlenebilir.
 * - `approved`  — onaylı; henüz mal kabulü yapılmamış.
 * - `partial`   — kısmi mal kabul yapılmış; en az bir satırda
 *                 `receivedQuantity < orderedQuantity`.
 * - `received`  — tüm satırlar tam karşılanmış; alış maliyeti
 *                 (gerçek `unitCost`) kaydedilmiş.
 * - `cancelled` — iptal edilmiş; mal kabulüne izin verilmez.
 *
 * Mal kabul detayları (GOAL-063 stok hareketleri tamamlandığında
 * `StockMovement` üretilecek; bu sözleşmede yalnızca line üzerindeki
 * `receivedQuantity` + `unitCost` tutulur; lot/SKT girişi Faz 6
 * ilerleyen goal'larında bağlanacak).
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Satın alma sipariş durumu (PurchaseOrderStatus)
 * -------------------------------------------------------------------------- */
export const purchaseOrderStatusSchema = z.enum([
  "draft",
  "approved",
  "partial",
  "received",
  "cancelled",
]);
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

/* --------------------------------------------------------------------------
 * Para birimi
 * -------------------------------------------------------------------------- */
export const purchaseOrderCurrencySchema = z.enum(["TRY", "GBP", "USD", "EUR"]);
export type PurchaseOrderCurrency = z.infer<typeof purchaseOrderCurrencySchema>;

/* --------------------------------------------------------------------------
 * Satın alma sipariş satırı (PurchaseOrderLine)
 * -------------------------------------------------------------------------- */

/**
 * Yeni satın alma sipariş satırı.
 * - `productId` zorunlu (Product.id referansı; GOAL-060).
 * - `unit` zorunlu (ProductUnit).
 * - `orderedQuantity` zorunlu (Decimal string).
 * - `unitPrice` zorunlu (Decimal string; birim alış fiyatı).
 * - `notes` opsiyonel.
 */
export const purchaseOrderLineInputSchema = z.object({
  productId: z.string().min(1).max(100),
  unit: z.string().min(1).max(32),
  orderedQuantity: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden miktar doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz miktar formatı"),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden fiyat doğrulamasıdır.
  unitPrice: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz fiyat formatı"),
  notes: z.string().max(2000).optional(),
});
export type PurchaseOrderLineInput = z.infer<
  typeof purchaseOrderLineInputSchema
>;

/**
 * Mal kabul satır kaydı (receivePurchaseOrder'a gelen satır başına
 * gerçekleşen bilgi). Yalnızca approved/partial siparişlerde geçerli.
 * - `lineId` zorunlu (PurchaseOrderLine.id).
 * - `receivedQuantity` zorunlu (Decimal string; bu kabulde gelen
 *   miktar; toplam kabul miktarını aşamaz).
 * - `unitCost` zorunlu (Decimal string; gerçek alış maliyeti;
 *   `unitPrice`'tan farklı olabilir — indirim/kargo dahil).
 */
export const purchaseOrderReceiveLineInputSchema = z.object({
  lineId: z.string().min(1).max(100),
  receivedQuantity: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden miktar doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz miktar formatı"),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden maliyet doğrulamasıdır.
  unitCost: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz maliyet formatı"),
  notes: z.string().max(2000).optional(),
});
export type PurchaseOrderReceiveLineInput = z.infer<
  typeof purchaseOrderReceiveLineInputSchema
>;

/* --------------------------------------------------------------------------
 * Satın alma sipariş oluşturma (taslak)
 * -------------------------------------------------------------------------- */

/**
 * Yeni satın alma sipariş taslağı.
 * - `supplierId` zorunlu (Supplier.id).
 * - `branchId` opsiyonel (GOAL-010 şube referansı; henüz
 *   product branch-scoped değil; opsiyonel bırakıldı).
 * - `currency` zorunlu (varsayılan: TRY).
 * - `expectedAt` opsiyonel (tahmini teslim tarihi).
 * - `lines` zorunlu (en az 1 satır).
 * - `notes` opsiyonel.
 */
export const purchaseOrderCreateInputSchema = z.object({
  supplierId: z.string().min(1).max(100),
  branchId: z.string().uuid().optional(),
  currency: purchaseOrderCurrencySchema.optional().default("TRY"),
  expectedAt: z.string().datetime().optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1).max(500),
  notes: z.string().max(2000).optional(),
});
export type PurchaseOrderCreateInput = z.infer<
  typeof purchaseOrderCreateInputSchema
>;

/** Taslak sipariş kısmi güncelleme. */
export const purchaseOrderUpdateInputSchema = z
  .object({
    supplierId: z.string().min(1).max(100).optional(),
    branchId: z.string().uuid().nullable().optional(),
    currency: purchaseOrderCurrencySchema.optional(),
    expectedAt: z.string().datetime().nullable().optional(),
    lines: z.array(purchaseOrderLineInputSchema).min(1).max(500).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type PurchaseOrderUpdateInput = z.infer<
  typeof purchaseOrderUpdateInputSchema
>;

/** Mal kabul isteği (toplu — birden çok satır tek seferde). */
export const purchaseOrderReceiveInputSchema = z.object({
  lines: z.array(purchaseOrderReceiveLineInputSchema).min(1).max(500),
  notes: z.string().max(2000).optional(),
});
export type PurchaseOrderReceiveInput = z.infer<
  typeof purchaseOrderReceiveInputSchema
>;

/** İptal isteği. */
export const purchaseOrderCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type PurchaseOrderCancelInput = z.infer<
  typeof purchaseOrderCancelInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const purchaseOrderLineSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  purchaseOrderId: z.string(),
  productId: z.string(),
  unit: z.string(),
  orderedQuantity: z.string(),
  unitPrice: z.string(),
  /** Toplam = orderedQuantity * unitPrice (Decimal string). */
  lineTotal: z.string(),
  /** Şimdiye kadar kabul edilen toplam miktar (Decimal string). */
  receivedQuantity: z.string(),
  /** Mal kabulde gerçekleşen birim maliyet (Decimal string). */
  unitCost: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;

export const purchaseOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  supplierId: z.string(),
  branchId: z.string().nullable(),
  status: purchaseOrderStatusSchema,
  currency: purchaseOrderCurrencySchema,
  expectedAt: z.string().datetime().nullable(),
  /** Sipariş toplam tutarı (lineTotal'ların toplamı; Decimal string). */
  totalAmount: z.string(),
  notes: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
  receivedAt: z.string().datetime().nullable(),
  receivedBy: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

/** Detay yanıtı: sipariş + satırlar. */
export const purchaseOrderDetailSchema = z.object({
  order: purchaseOrderSchema,
  lines: z.array(purchaseOrderLineSchema),
});
export type PurchaseOrderDetail = z.infer<typeof purchaseOrderDetailSchema>;

/** Liste filtreleri. */
export const purchaseOrderFiltersSchema = z.object({
  status: purchaseOrderStatusSchema.optional(),
  supplierId: z.string().optional(),
  branchId: z.string().uuid().optional(),
  /** Sıralama: createdAt desc (default) | asc. */
  sort: z.enum(["asc", "desc"]).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PurchaseOrderFilters = z.infer<typeof purchaseOrderFiltersSchema>;

/** Liste response şeması. */
export const purchaseOrderListResponseSchema = z.object({
  items: z.array(purchaseOrderSchema),
  total: z.number().int().nonnegative(),
});
export type PurchaseOrderListResponse = z.infer<
  typeof purchaseOrderListResponseSchema
>;
