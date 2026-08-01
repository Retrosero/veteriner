/**
 * @file Kasa (cash register) oturumları ve gün sonu API sözleşmesi.
 * @module @vetniva/contracts/cash-register
 *
 * @description GOAL-074 (FAZ-7) kasa ve gün sonu için Zod şemaları +
 *   tipler. Şube bazlı kasa oturumları, açılış/kapanış bakiyeleri
 *   ve gün sonu fark raporları.
 *
 * Kapsam:
 * - Açılış (opening): kasa açılış bakiyesi + açılış zamanı.
 * - Tahsilat / iade: `payment` modülü (GOAL-072/073) üzerinden
 *   `KasaRepository` ledger'ına yansır; burada read-only.
 * - Gider: ileriye dönük — `expense` modülü Faz 13'te (stub bu
 *   sözleşmede `expenseType: 'other'` ile yer alır; core'da
 *   yalnızca okuma).
 * - Kapanış (closing): gerçek nakit sayımı + beklenen bakiye +
 *   fark (variance).
 * - Yeniden açma (reopen): kapatılmış oturumda OWNER düzeltme
 *   (tarihçe append-only; reopen edilen oturum ayrı bir close
 *   gerektirir).
 *
 * Çoklu hesap (cash / card / bank / other): tek bir session
 * kapsamında 4 hesap birden izlenir; summary bu hesap bazında
 * toplam verir.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır. Para alanları
 *   `numeric` (Prisma Decimal) olarak saklanır.
 * @since GOAL-074 (FAZ-7) kasa ve gün sonu core
 */

import { z } from "zod";

import { paymentMethodSchema } from "./payment.js";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

/**
 * Kasa oturum durumu.
 * - `open`      — aktif; tahsilat/iade bu oturuma yansır.
 * - `closed`    — kapanış tamamlandı; reopen ile yeniden açılabilir.
 * - `reopened`  — daha önce kapatılmış, OWNER tarafından tekrar
 *   açılmış; üzerine yeni hareket alabilir.
 */
export const cashRegisterSessionStatusSchema = z.enum([
  "open",
  "closed",
  "reopened",
]);
export type CashRegisterSessionStatus = z.infer<
  typeof cashRegisterSessionStatusSchema
>;

/** Para birimi (yalnızca TRY pilotta). */
export const cashRegisterCurrencySchema = z.enum(["TRY", "GBP", "USD", "EUR"]);
export type CashRegisterCurrency = z.infer<typeof cashRegisterCurrencySchema>;

/* --------------------------------------------------------------------------
 * Açılış (open session)
 * -------------------------------------------------------------------------- */

/**
 * Yeni kasa oturumu açma isteği.
 * - `branchId` zorunlu (şube bazlı kasa).
 * - `openingBalance` zorunlu (Decimal string, >= 0).
 * - `note` opsiyonel.
 * - `currency` default TRY.
 */
export const cashRegisterSessionOpenInputSchema = z.object({
  branchId: z.string().uuid(),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden decimal doğrulamasıdır.
  openingBalance: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz tutar"),
  note: z.string().max(2000).optional(),
  currency: cashRegisterCurrencySchema.optional().default("TRY"),
});
export type CashRegisterSessionOpenInput = z.input<
  typeof cashRegisterSessionOpenInputSchema
>;

/* --------------------------------------------------------------------------
 * Kapanış (close session)
 * -------------------------------------------------------------------------- */

/**
 * Kapanış isteği.
 * - `closingBalance` zorunlu (gerçek nakit sayımı, Decimal string).
 * - `note` opsiyonel.
 * - Server beklenen bakiyeyi `openingBalance + sum(movements)` üzerinden
 *   hesaplar; variance = closing - expected döner response'ta.
 */
export const cashRegisterSessionCloseInputSchema = z.object({
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden decimal doğrulamasıdır.
  closingBalance: z.string().regex(/^\d+(\.\d{1,4})?$/, "Geçersiz tutar"),
  note: z.string().max(2000).optional(),
});
export type CashRegisterSessionCloseInput = z.infer<
  typeof cashRegisterSessionCloseInputSchema
>;

/**
 * Reopen isteği (OWNER yetkisi gerekir; yalnızca `closed` oturumlar
 * yeniden açılabilir).
 */
export const cashRegisterSessionReopenInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type CashRegisterSessionReopenInput = z.infer<
  typeof cashRegisterSessionReopenInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const cashRegisterSessionSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  status: cashRegisterSessionStatusSchema,
  currency: cashRegisterCurrencySchema,
  openingBalance: z.string(),
  /** Kapanış gerçek bakiyesi (kapanış sonrası dolu). */
  closingBalance: z.string().nullable(),
  /** Beklenen bakiye (kapanış sonrası dolu): opening + sum(movements). */
  expectedBalance: z.string().nullable(),
  /** closing - expected; pozitif = fazla, negatif = eksik. */
  variance: z.string().nullable(),
  openedAt: z.string().datetime(),
  openedBy: z.string(),
  closedAt: z.string().datetime().nullable(),
  closedBy: z.string().nullable(),
  /** Reopen edildi ise orijinal kapanış zamanı. */
  originalClosedAt: z.string().datetime().nullable(),
  reopenReason: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CashRegisterSession = z.infer<typeof cashRegisterSessionSchema>;

/**
 * Hesap bazlı özet (cash / card / bank / other). Session kapanışında
 * her hesap için net bakiye ve hareket sayısı.
 */
export const cashRegisterAccountSummarySchema = z.object({
  account: z.enum(["cash", "card", "bank", "other"]),
  /** Bu hesaba yansıyan credit (tahsilat) toplamı. */
  totalCredit: z.string(),
  /** Bu hesaba yansıyan debit (ters kayıt / iade) toplamı. */
  totalDebit: z.string(),
  /** Net bakiye = totalCredit - totalDebit. */
  netBalance: z.string(),
  movementCount: z.number().int().nonnegative(),
});
export type CashRegisterAccountSummary = z.infer<
  typeof cashRegisterAccountSummarySchema
>;

export const cashRegisterSessionSummarySchema = z.object({
  sessionId: z.string(),
  branchId: z.string().uuid(),
  status: cashRegisterSessionStatusSchema,
  currency: cashRegisterCurrencySchema,
  openingBalance: z.string(),
  closingBalance: z.string().nullable(),
  expectedBalance: z.string(),
  variance: z.string().nullable(),
  totalMovementCount: z.number().int().nonnegative(),
  accounts: z.array(cashRegisterAccountSummarySchema),
  closedAt: z.string().datetime().nullable(),
});
export type CashRegisterSessionSummary = z.infer<
  typeof cashRegisterSessionSummarySchema
>;

/** Bir session'a bağlı kasa hareketi (read-only view). */
export const cashRegisterMovementSchema = z.object({
  id: z.string(),
  sessionId: z.string().nullable(),
  tenantId: z.string().uuid(),
  account: z.enum(["cash", "card", "bank", "other"]),
  amountSigned: z.string(),
  direction: z.enum(["credit", "debit"]),
  source: z.enum([
    "payment_create",
    "payment_reverse",
    "payment_partial_reverse",
    "manual_adjustment",
  ]),
  referenceId: z.string(),
  referenceType: z.enum(["payment", "payment_reversal"]),
  method: paymentMethodSchema,
  currency: z.string(),
  occurredAt: z.string().datetime(),
  actorId: z.string(),
  note: z.string().nullable(),
});
export type CashRegisterMovement = z.infer<typeof cashRegisterMovementSchema>;

/** Liste filtreleri. */
export const cashRegisterSessionFiltersSchema = z.object({
  branchId: z.string().uuid().optional(),
  status: cashRegisterSessionStatusSchema.optional(),
  /** ISO date (YYYY-MM-DD) — bu tarihte açılan oturumlar. */
  openedOnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih (YYYY-MM-DD)")
    .optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type CashRegisterSessionFilters = z.input<
  typeof cashRegisterSessionFiltersSchema
>;

export const cashRegisterSessionListResponseSchema = z.object({
  items: z.array(cashRegisterSessionSchema),
  total: z.number().int().nonnegative(),
});
export type CashRegisterSessionListResponse = z.infer<
  typeof cashRegisterSessionListResponseSchema
>;

export const cashRegisterMovementListResponseSchema = z.object({
  items: z.array(cashRegisterMovementSchema),
  total: z.number().int().nonnegative(),
});
export type CashRegisterMovementListResponse = z.infer<
  typeof cashRegisterMovementListResponseSchema
>;
