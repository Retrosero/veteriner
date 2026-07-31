/**
 * @file Tahsilat ters kayıt (payment reversal) API sözleşmesi.
 * @module @vetniva/contracts/payment-reversal
 *
 * @description GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt için
 *   Zod şemaları + tipler. GOAL-072'nin basit tam ters kayıt
 *   akışını genişletir:
 *
 * - **Kısmi ters kayıt**: `amount` opsiyonel; verilirse
 *   `amount <= payment.amount - sum(reversed)` olmalı. Tam
 *   tutar verilirse statü `reversed`'a geçer; kısmi tutar
 *   verilirse statü `partially_reversed` olur.
 * - **Neden kodu**: serbest metin yerine enum. Tüm iptal
 *   işlemlerinde neden zorunludur; aksi → 422 VET-PAYMENT-0009.
 * - **Kasa etkisi**: her reversal bir kasa hareketi oluşturur
 *   (kasa tarafında bakiye düşer; nakit/card/bank farklı
 *   hesaplar). Kasa modülü FAZ-7 kapsamı dışındadır; burada
 *   audit event ile işlenir.
 * - **Yetki**: yüksek tutarlı (> 1000 TRY) ters kayıtlar için
 *   OWNER zorunlu; aksi → 403 VET-PAYMENT-0010.
 *
 * Append-only: orijinal payment kaydı `status` alanı
 * (completed → partially_reversed / reversed) dışında
 * değişmez. Ters kayıt bilgisi ayrı `PaymentReversal`
 * kayıtlarında tutulur; fiziksel silme yok.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır. Para alanları
 *   `numeric` (Prisma Decimal) olarak saklanır.
 * @since GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
 */

import { z } from "zod";

import {
  paymentCurrencySchema,
  paymentMethodSchema,
  paymentSourceTypeSchema,
} from "./payment.js";

/* --------------------------------------------------------------------------
 * Neden kodu (enum)
 * -------------------------------------------------------------------------- */

/**
 * Ters kayıt neden kodu. Serbest metin KABUL EDILMEZ. Gelecekte
 * ülke/banka bazlı ek kodlar bu enum'a eklenir.
 *
 * - `customer_request`     — müşteri talebi (yanlış ürün, vazgeçme).
 * - `chargeback`           — banka chargeback (kart iadesi).
 * - `duplicate`            — mükerrer tahsilat düzeltmesi.
 * - `system_error`         — sistem hatası nedeniyle iptal.
 * - `pricing_error`        — fiyat/fatura hatası.
 * - `other`                — diğer (note zorunlu, max 2000 karakter).
 */
export const paymentReverseReasonSchema = z.enum([
  "customer_request",
  "chargeback",
  "duplicate",
  "system_error",
  "pricing_error",
  "other",
]);
export type PaymentReverseReason = z.infer<typeof paymentReverseReasonSchema>;

/* --------------------------------------------------------------------------
 * Ters kayıt giriş şeması
 * -------------------------------------------------------------------------- */

/**
 * Ters kayıt isteği.
 * - `amount` opsiyonel: verilirse kısmi ters kayıt; default =
 *   kalan tutar (payment.amount - sum(reversed)). amount=0
 *   reddedilir (422 VET-PAYMENT-0007).
 * - `reason` zorunlu (enum).
 * - `note` opsiyonel (max 2000 karakter; `other` neden için
 *   önerilir).
 * - `cashRegisterEffect` opsiyonel boolean (default true);
 *   false ise kasa hareketi oluşturulmaz (ör. banka
 *   chargeback'inde kasa etkisi ayrıca işlenir).
 */
export const paymentReversalCreateInputSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz tutar")
    .optional(),
  reason: paymentReverseReasonSchema,
  note: z.string().max(2000).optional(),
  cashRegisterEffect: z.boolean().optional().default(true),
});
export type PaymentReversalCreateInput = z.infer<
  typeof paymentReversalCreateInputSchema
>;

/* --------------------------------------------------------------------------
 * Ters kayıt response şeması
 * -------------------------------------------------------------------------- */

/**
 * Ters kayıt kaydı (append-only). Bir payment'a birden fazla
 * ters kayıt bağlanabilir (kümülatif, toplam ≤ payment.amount).
 */
export const paymentReversalSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  paymentId: z.string(),
  sourceType: paymentSourceTypeSchema,
  sourceId: z.string(),
  amount: z.string(),
  method: paymentMethodSchema,
  currency: paymentCurrencySchema,
  reason: paymentReverseReasonSchema,
  note: z.string().nullable(),
  cashRegisterEffect: z.boolean(),
  reversedAt: z.string().datetime(),
  reversedBy: z.string(),
  createdAt: z.string().datetime(),
});
export type PaymentReversal = z.infer<typeof paymentReversalSchema>;

/* --------------------------------------------------------------------------
 * Özet (kasa + raporlama)
 * -------------------------------------------------------------------------- */

/**
 * Bir payment için ters kayıt özeti (raporlama için).
 * `totalReversed` = sum(reversal.amount);
 * `remainingAmount` = payment.amount - totalReversed (>= 0).
 */
export const paymentReversalSummarySchema = z.object({
  paymentId: z.string(),
  paymentAmount: z.string(),
  totalReversed: z.string(),
  remainingAmount: z.string(),
  reversalCount: z.number().int().nonnegative(),
  lastReversalAt: z.string().datetime().nullable(),
});
export type PaymentReversalSummary = z.infer<
  typeof paymentReversalSummarySchema
>;

/* --------------------------------------------------------------------------
 * Filtre
 * -------------------------------------------------------------------------- */

export const paymentReversalFiltersSchema = z.object({
  paymentId: z.string().optional(),
  sourceType: paymentSourceTypeSchema.optional(),
  sourceId: z.string().optional(),
  reason: paymentReverseReasonSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PaymentReversalFilters = z.infer<
  typeof paymentReversalFiltersSchema
>;

export const paymentReversalListResponseSchema = z.object({
  items: z.array(paymentReversalSchema),
  total: z.number().int().nonnegative(),
});
export type PaymentReversalListResponse = z.infer<
  typeof paymentReversalListResponseSchema
>;
