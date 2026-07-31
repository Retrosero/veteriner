/**
 * @file Petshop satış iadesi (sale return) API sözleşmesi.
 * @module @vetniva/contracts/petshop-sale-return
 *
 * @description GOAL-065 (FAZ-6) petshop satış iadesi sözleşmesi.
 *   Tamamlanmış (completed) bir petshop satışına bağlı, tam veya
 *   kısmi iade akışı. Stok iade hareketi (`return`) ve tahsilat
 *   ters kaydı bu modülden yönetilir.
 *
 * Yaşam döngüsü:
 * - `draft`     — iade taslağı; satırlar düzenlenebilir.
 * - `completed` — stok iade hareketi oluşturuldu, tahsilat
 *                 ters kaydı yapıldı; müşteriye iade ödemesi
 *                 tamamlandı.
 * - `cancelled` — iptal edildi (henüz `completed` değilse).
 *
 * Satır alanları:
 * - `originalLineId` : iade edilen orijinal satış satırı.
 * - `productId`      : orijinal satırdan kopyalanır.
 * - `lotId`          : opsiyonel; belirtilirse lot hâlâ aktif ve
 *                      arşivsiz olmalı; SKT kontrolü stok servisinde.
 * - `quantity`       : iade miktarı (Decimal string > 0).
 * - `unitPrice`      : orijinal satırdan kopyalanır (fiyat değişmez).
 * - `discountPercent`: orijinal satırdan kopyalanır.
 *
 * İade tutarı:
 * - `refundAmount`   : toplam iade tutarı (Decimal string) =
 *                      Σ(lineTotal) − globalDiscount kısmi.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import { z } from "zod";

import {
  petshopPaymentMethodSchema,
  type PetshopPaymentMethod,
} from "./petshop-sale.js";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

export const petshopSaleReturnStatusSchema = z.enum([
  "draft",
  "completed",
  "cancelled",
]);
export type PetshopSaleReturnStatus = z.infer<
  typeof petshopSaleReturnStatusSchema
>;

/* --------------------------------------------------------------------------
 * İade satırı girdisi
 * --------------------------------------------------------------------------
 * - `originalLineId` zorunlu (PetshopSaleLine.id referansı).
 * - `productId` zorunlu (orijinal satırdaki ürün; doğrulama
 *   service'te yapılır).
 * - `lotId` opsiyonel; purchaseTracked ürünler için tavsiye edilir.
 * - `quantity` zorunlu (Decimal string, > 0; orijinal satılan
 *   miktardan fazla olamaz).
 * - `unitPrice` zorunlu (Decimal string, >= 0; orijinal satıştan
 *   kopyalanır).
 * - `discountPercent` opsiyonel (0-100).
 * - `reason` opsiyonel (satır bazlı neden).
 */
export const petshopSaleReturnLineInputSchema = z.object({
  originalLineId: z.string().min(1).max(100),
  productId: z.string().min(1).max(100),
  lotId: z.string().min(1).max(100).optional(),
  unit: z.string().min(1).max(32),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz miktar"),
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz fiyat"),
  discountPercent: z
    .number()
    .min(0)
    .max(100)
    .optional(),
  reason: z.string().max(2000).optional(),
});
export type PetshopSaleReturnLineInput = z.infer<
  typeof petshopSaleReturnLineInputSchema
>;

/* --------------------------------------------------------------------------
 * Yeni iade oluşturma (taslak)
 * --------------------------------------------------------------------------
 * - `originalSaleId` zorunlu (tamamlanmış petshop satışı).
 * - `lines` en az 1 satır.
 * - `refundMethod` opsiyonel (default: cash).
 * - `globalDiscountPercent` opsiyonel (0-100).
 * - `notes` opsiyonel.
 * - `reason` zorunlu (müşteri iade nedeni).
 */
export const petshopSaleReturnCreateInputSchema = z.object({
  originalSaleId: z.string().min(1).max(100),
  lines: z.array(petshopSaleReturnLineInputSchema).min(1).max(500),
  refundMethod: petshopPaymentMethodSchema.optional().default("cash"),
  globalDiscountPercent: z.number().min(0).max(100).optional().default(0),
  notes: z.string().max(2000).optional(),
  reason: z.string().min(3).max(2000),
});
export type PetshopSaleReturnCreateInput = z.infer<
  typeof petshopSaleReturnCreateInputSchema
>;

/* --------------------------------------------------------------------------
 * Tamamlama isteği (draft → completed)
 * -------------------------------------------------------------------------- */

export const petshopSaleReturnCompleteInputSchema = z
  .object({
    refundMethod: petshopPaymentMethodSchema.optional(),
    notes: z.string().max(2000).optional(),
  })
  .optional();
export type PetshopSaleReturnCompleteInput = z.infer<
  typeof petshopSaleReturnCompleteInputSchema
>;

/* --------------------------------------------------------------------------
 * İptal isteği
 * -------------------------------------------------------------------------- */

export const petshopSaleReturnCancelInputSchema = z.object({
  reason: z.string().min(3).max(2000),
});
export type PetshopSaleReturnCancelInput = z.infer<
  typeof petshopSaleReturnCancelInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const petshopSaleReturnLineSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  returnId: z.string(),
  originalLineId: z.string(),
  productId: z.string(),
  lotId: z.string().nullable(),
  unit: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  discountPercent: z.number(),
  /** quantity * unitPrice * (1 - discountPercent/100) (Decimal string). */
  lineTotal: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PetshopSaleReturnLine = z.infer<
  typeof petshopSaleReturnLineSchema
>;

export const petshopSaleReturnSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  status: petshopSaleReturnStatusSchema,
  originalSaleId: z.string(),
  customerOwnerId: z.string().nullable(),
  customerPatientId: z.string().nullable(),
  refundMethod: petshopPaymentMethodSchema,
  /** Bracket toplam: lineTotal'ların toplamı (Decimal string). */
  totalAmount: z.string(),
  /** Global indirim yüzdesi (iade sepeti düzeyinde). */
  globalDiscountPercent: z.number(),
  /** İndirim sonrası iade tutarı (Decimal string). */
  refundAmount: z.string(),
  reason: z.string(),
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
export type PetshopSaleReturn = z.infer<typeof petshopSaleReturnSchema>;

/** Detay yanıtı: iade + satırlar. */
export const petshopSaleReturnDetailSchema = z.object({
  return: petshopSaleReturnSchema,
  lines: z.array(petshopSaleReturnLineSchema),
});
export type PetshopSaleReturnDetail = z.infer<
  typeof petshopSaleReturnDetailSchema
>;

/** Liste filtreleri. */
export const petshopSaleReturnFiltersSchema = z.object({
  status: petshopSaleReturnStatusSchema.optional(),
  originalSaleId: z.string().min(1).max(100).optional(),
  customerOwnerId: z.string().uuid().optional(),
  customerPatientId: z.string().uuid().optional(),
  refundMethod: petshopPaymentMethodSchema.optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PetshopSaleReturnFilters = z.infer<
  typeof petshopSaleReturnFiltersSchema
>;

/** Liste response şeması. */
export const petshopSaleReturnListResponseSchema = z.object({
  items: z.array(petshopSaleReturnSchema),
  total: z.number().int().nonnegative(),
});
export type PetshopSaleReturnListResponse = z.infer<
  typeof petshopSaleReturnListResponseSchema
>;

export type { PetshopPaymentMethod };
