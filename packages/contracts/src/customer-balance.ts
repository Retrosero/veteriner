/**
 * @file Müşteri (sahip) borç/alacak görünümü API sözleşmesi.
 * @module @vetniva/contracts/customer-balance
 *
 * @description GOAL-075 (FAZ-7) müşteri borç/alacak görünümü
 * için Zod şemaları + tipler. Hasta sahibi (Owner) bazında
 * toplam satış, tahsilat ve açık bakiye. Pilot kapsamında
 * read-only; veri değiştirmez.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır. Rapor
 *   query'leri tenant ve (varsa) branch scope'a uyar.
 * @since GOAL-075 (FAZ-7) müşteri borç/alacak görünümü core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Müşteri özeti
 * -------------------------------------------------------------------------- */

export const customerBalanceSummarySchema = z.object({
  ownerId: z.string().uuid(),
  totalSaleAmount: z.string(),
  totalPaidAmount: z.string(),
  totalReversedAmount: z.string(),
  totalNetAmount: z.string(),
  openAmount: z.string(),
  saleCount: z.number().int().nonnegative(),
  paymentCount: z.number().int().nonnegative(),
  lastSaleAt: z.string().datetime().nullable(),
  lastPaymentAt: z.string().datetime().nullable(),
});
export type CustomerBalanceSummary = z.infer<
  typeof customerBalanceSummarySchema
>;

/* --------------------------------------------------------------------------
 * İşlem geçmişi (sales + payments karışık)
 * -------------------------------------------------------------------------- */

export const customerTransactionTypeSchema = z.enum([
  "sale",
  "payment",
  "refund",
]);
export type CustomerTransactionType = z.infer<
  typeof customerTransactionTypeSchema
>;

export const customerTransactionSchema = z.object({
  id: z.string(),
  ownerId: z.string().uuid(),
  type: customerTransactionTypeSchema,
  /** "clinic_sale" | "petshop_sale" | "payment" | "refund". */
  sourceType: z.string(),
  sourceId: z.string(),
  amount: z.string(),
  currency: z.string(),
  occurredAt: z.string().datetime(),
  status: z.string(),
});
export type CustomerTransaction = z.infer<
  typeof customerTransactionSchema
>;

export const customerTransactionsResponseSchema = z.object({
  ownerId: z.string().uuid(),
  totalCount: z.number().int().nonnegative(),
  items: z.array(customerTransactionSchema),
});
export type CustomerTransactionsResponse = z.infer<
  typeof customerTransactionsResponseSchema
>;

/* --------------------------------------------------------------------------
 * Filtreler
 * -------------------------------------------------------------------------- */

export const customerTransactionsFiltersSchema = z.object({
  type: customerTransactionTypeSchema.optional(),
  /** Sıralama: occurredAt desc (default) | asc. */
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type CustomerTransactionsFilters = z.infer<
  typeof customerTransactionsFiltersSchema
>;
