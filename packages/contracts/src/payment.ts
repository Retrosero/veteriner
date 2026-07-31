/**
 * @file Tahsilat (payment) API sözleşmesi.
 * @module @vetniva/contracts/payment
 *
 * @description GOAL-072 (FAZ-7) tahsilat için Zod şemaları + tipler.
 *   Klinik satış (clinic_sale) ve petshop satış (petshop_sale)
 *   kayıtlarına tahsilat bağlar. Kısmi tahsilat desteklenir
 *   (aynı sourceId'ye birden fazla payment). Aynı idempotencyKey
 *   ile 2. çağrı mevcut kaydı döner.
 *
 * Yöntemler:
 * - `cash`          — nakit.
 * - `card`          — kart.
 * - `bank_transfer` — banka havalesi/EFT.
 * - `other`         — diğer (cari hesap mahsuplastırma vb.).
 *
 * Kaynak bağlamı (sourceType + sourceId):
 * - `clinic_sale`   — klinik satış (GOAL-071).
 * - `petshop_sale`  — petshop satış (GOAL-064).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır. Para alanları
 *   `numeric` (Prisma Decimal) olarak saklanır.
 * @since GOAL-072 (FAZ-7) tahsilat core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

export const paymentMethodSchema = z.enum([
  "cash",
  "card",
  "bank_transfer",
  "other",
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentStatusSchema = z.enum([
  "completed",
  "reversed",
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSourceTypeSchema = z.enum([
  "clinic_sale",
  "petshop_sale",
]);
export type PaymentSourceType = z.infer<typeof paymentSourceTypeSchema>;

export const paymentCurrencySchema = z.enum([
  "TRY",
  "GBP",
  "USD",
  "EUR",
]);
export type PaymentCurrency = z.infer<typeof paymentCurrencySchema>;

/* --------------------------------------------------------------------------
 * Yeni tahsilat
 * -------------------------------------------------------------------------- */

/**
 * Yeni tahsilat kaydı.
 * - `sourceType` zorunlu (hangi satış tipi).
 * - `sourceId` zorunlu (ilgili satış id).
 * - `amount` zorunlu (Decimal string, > 0).
 * - `method` zorunlu (cash/card/bank_transfer/other).
 * - `currency` zorunlu (varsayılan TRY).
 * - `paidAt` opsiyonel (default: now).
 * - `idempotencyKey` opsiyonel (aynı key ile 2. çağrıda mevcut
 *   kayıt döner; 409 farklı body ile).
 * - `notes` opsiyonel.
 */
export const paymentCreateInputSchema = z.object({
  sourceType: paymentSourceTypeSchema,
  sourceId: z.string().min(1).max(100),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz tutar"),
  method: paymentMethodSchema,
  currency: paymentCurrencySchema.optional().default("TRY"),
  paidAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});
export type PaymentCreateInput = z.infer<typeof paymentCreateInputSchema>;

/** Ters kayıt isteği. */
export const paymentReverseInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type PaymentReverseInput = z.infer<typeof paymentReverseInputSchema>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const paymentSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  sourceType: paymentSourceTypeSchema,
  sourceId: z.string(),
  amount: z.string(),
  method: paymentMethodSchema,
  currency: paymentCurrencySchema,
  paidAt: z.string().datetime(),
  idempotencyKey: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  status: paymentStatusSchema,
  reversedAt: z.string().datetime().nullable(),
  reversedBy: z.string().nullable(),
  reverseReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;

/** Liste filtreleri. */
export const paymentFiltersSchema = z.object({
  status: paymentStatusSchema.optional(),
  sourceType: paymentSourceTypeSchema.optional(),
  sourceId: z.string().optional(),
  method: paymentMethodSchema.optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PaymentFilters = z.infer<typeof paymentFiltersSchema>;

/** Liste response şeması. */
export const paymentListResponseSchema = z.object({
  items: z.array(paymentSchema),
  total: z.number().int().nonnegative(),
});
export type PaymentListResponse = z.infer<typeof paymentListResponseSchema>;
