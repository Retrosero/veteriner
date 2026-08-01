/**
 * @file Düşük stok ve SKT uyarıları API sözleşmesi.
 * @module @vetniva/contracts/stock-alert
 *
 * @description GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları için Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve frontend
 * (dashboard/listeleme/acknowledge) aynı kaynaktan tüketir.
 *
 * İki temel uyarı türü:
 * - `LowStockAlert` — ürünün net stoğu `lowStockThreshold` eşiğinin
 *   altına düştüğünde tetiklenir. Ürün `purchaseTracked=true` VE
 *   arşivsiz olmalı.
 * - `ExpiringLotAlert` — aktif lot için `expiryDate <= now + daysAhead`
 *   olduğunda tetiklenir. SKT geçmiş lotlar için `severity=expired`.
 *
 * Her iki uyarı da **on-demand compute** mantığıyla çalışır: uyarılar
 * talep üzerine hesaplanır (refresh), ack'lar ayrı tabloda tutulur.
 *
 * Uyarı yaşam döngüsü (`status`):
 * - `active`       — hesaplamada tetiklendi, henüz işlem yapılmadı.
 * - `acknowledged` — kullanıcı tarafından görüldü işaretlendi.
 * - `resolved`     — koşul ortadan kalktı (stok eşiğin üstüne çıktı
 *                    veya lot arşivlendi/SKT uzaklaştı). Ack bilgisi
 *                    audit trail için korunur, listede görünmez.
 *
 * Severity seviyeleri:
 * - `LowStockAlert`:  `warning` (0 < qty <= threshold), `critical` (qty <= 0).
 * - `ExpiringLotAlert`: `warning` (8..daysAhead), `critical` (1..7),
 *                       `expired` (<= 0).
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları core
 */

import { z } from "zod";

import { productUnitSchema } from "./product.js";

/* --------------------------------------------------------------------------
 * Düşük stok uyarısı (LowStockAlert)
 * -------------------------------------------------------------------------- */

/** Düşük stok uyarı durumu. */
export const lowStockAlertStatusSchema = z.enum([
  "active",
  "acknowledged",
  "resolved",
]);
export type LowStockAlertStatus = z.infer<typeof lowStockAlertStatusSchema>;

/** Düşük stok uyarı şiddeti. */
export const lowStockAlertSeveritySchema = z.enum(["warning", "critical"]);
export type LowStockAlertSeverity = z.infer<typeof lowStockAlertSeveritySchema>;

/** API response şeması. */
export const lowStockAlertSchema = z.object({
  /** `tenantId|productId` deterministik; aynı ürün için tek uyarı. */
  id: z.string(),
  tenantId: z.string().uuid(),
  productId: z.string(),
  productName: z.string(),
  productSku: z.string().nullable(),
  productKind: z.enum([
    "stock_product",
    "medicine",
    "vaccine",
    "service",
    "consumable",
  ]),
  unit: productUnitSchema,
  /** Decimal string; anlık hesaplanan net miktar. */
  currentQuantity: z.string(),
  /** Decimal string; ürünün lowStockThreshold alanı. */
  threshold: z.string(),
  severity: lowStockAlertSeveritySchema,
  status: lowStockAlertStatusSchema,
  acknowledgedAt: z.string().datetime().nullable(),
  acknowledgedBy: z.string().nullable(),
  /** Hesaplama zamanı (refresh anı). */
  computedAt: z.string().datetime(),
});
export type LowStockAlert = z.infer<typeof lowStockAlertSchema>;

/** Düşük stok listeleme filtreleri. */
export const lowStockAlertFiltersSchema = z.object({
  severity: lowStockAlertSeveritySchema.optional(),
  status: lowStockAlertStatusSchema.optional(),
  productId: z.string().optional(),
  /** Yalnızca aktif (acknowledged olmayan) uyarılar. */
  activeOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type LowStockAlertFilters = z.infer<typeof lowStockAlertFiltersSchema>;

/** Liste response şeması. */
export const lowStockAlertListResponseSchema = z.object({
  items: z.array(lowStockAlertSchema),
  total: z.number().int().nonnegative(),
});
export type LowStockAlertListResponse = z.infer<
  typeof lowStockAlertListResponseSchema
>;

/** Acknowledge isteği. Boş gövde kabul edilir (idempotent). */
export const lowStockAlertAcknowledgeInputSchema = z
  .object({
    note: z.string().max(500).optional(),
  })
  .optional();
export type LowStockAlertAcknowledgeInput = z.infer<
  typeof lowStockAlertAcknowledgeInputSchema
>;

/* --------------------------------------------------------------------------
 * SKT uyarısı (ExpiringLotAlert)
 * -------------------------------------------------------------------------- */

/** SKT uyarı durumu. */
export const expiringLotAlertStatusSchema = z.enum([
  "active",
  "acknowledged",
  "resolved",
]);
export type ExpiringLotAlertStatus = z.infer<
  typeof expiringLotAlertStatusSchema
>;

/** SKT uyarı şiddeti. */
export const expiringLotAlertSeveritySchema = z.enum([
  "warning",
  "critical",
  "expired",
]);
export type ExpiringLotAlertSeverity = z.infer<
  typeof expiringLotAlertSeveritySchema
>;

/** API response şeması. */
export const expiringLotAlertSchema = z.object({
  /** `tenantId|lotId` deterministik; aynı lot için tek uyarı. */
  id: z.string(),
  tenantId: z.string().uuid(),
  lotId: z.string(),
  lotNumber: z.string(),
  productId: z.string(),
  productName: z.string(),
  productSku: z.string().nullable(),
  expiryDate: z.string().datetime(),
  /** SKT'ye kalan gün (negatif = geçmiş gün sayısı). */
  daysUntilExpiry: z.number().int(),
  /** Lot için hesaplanan net miktar. */
  currentQuantity: z.string(),
  severity: expiringLotAlertSeveritySchema,
  status: expiringLotAlertStatusSchema,
  acknowledgedAt: z.string().datetime().nullable(),
  acknowledgedBy: z.string().nullable(),
  computedAt: z.string().datetime(),
});
export type ExpiringLotAlert = z.infer<typeof expiringLotAlertSchema>;

/** SKT listeleme filtreleri. */
export const expiringLotAlertFiltersSchema = z.object({
  severity: expiringLotAlertSeveritySchema.optional(),
  status: expiringLotAlertStatusSchema.optional(),
  lotId: z.string().optional(),
  productId: z.string().optional(),
  /** SKT'ye kalan gün sayısı filtresi (üst sınır; default 30). */
  daysAhead: z.coerce.number().int().min(1).max(365).default(30),
  activeOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ExpiringLotAlertFilters = z.infer<
  typeof expiringLotAlertFiltersSchema
>;

/** Liste response şeması. */
export const expiringLotAlertListResponseSchema = z.object({
  items: z.array(expiringLotAlertSchema),
  total: z.number().int().nonnegative(),
});
export type ExpiringLotAlertListResponse = z.infer<
  typeof expiringLotAlertListResponseSchema
>;

/** Acknowledge isteği. */
export const expiringLotAlertAcknowledgeInputSchema = z
  .object({
    note: z.string().max(500).optional(),
  })
  .optional();
export type ExpiringLotAlertAcknowledgeInput = z.infer<
  typeof expiringLotAlertAcknowledgeInputSchema
>;

/* --------------------------------------------------------------------------
 * Yenileme (refresh) ve dashboard özeti
 * -------------------------------------------------------------------------- */

/** Yenileme isteği (opsiyonel). Boş gövde de kabul edilir. */
export const stockAlertRefreshInputSchema = z
  .object({
    /** true: ack'lar korunmaz, sıfırlanır. */
    resetAcknowledgements: z.boolean().optional(),
  })
  .optional()
  .transform((v) => v ?? {});
export type StockAlertRefreshInput = z.infer<
  typeof stockAlertRefreshInputSchema
>;

/** Yenileme sonucu. */
export const stockAlertRefreshResponseSchema = z.object({
  computedAt: z.string().datetime(),
  lowStockAlertCount: z.number().int().nonnegative(),
  expiringLotAlertCount: z.number().int().nonnegative(),
  criticalLowStockCount: z.number().int().nonnegative(),
  expiredLotCount: z.number().int().nonnegative(),
});
export type StockAlertRefreshResponse = z.infer<
  typeof stockAlertRefreshResponseSchema
>;

/** Dashboard özeti (yenileme olmadan hızlı bakış). */
export const stockAlertSummarySchema = z.object({
  computedAt: z.string().datetime(),
  lowStockAlertCount: z.number().int().nonnegative(),
  criticalLowStockCount: z.number().int().nonnegative(),
  expiringLotAlertCount: z.number().int().nonnegative(),
  criticalLotCount: z.number().int().nonnegative(),
  expiredLotCount: z.number().int().nonnegative(),
  acknowledgedLowStockCount: z.number().int().nonnegative(),
  acknowledgedLotCount: z.number().int().nonnegative(),
});
export type StockAlertSummary = z.infer<typeof stockAlertSummarySchema>;
