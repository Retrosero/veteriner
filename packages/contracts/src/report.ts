/**
 * @file Temel finans raporları API sözleşmesi.
 * @module @vetniva/contracts/report
 *
 * @description GOAL-076 (FAZ-7) temel finans raporları için Zod
 * şemaları + tipler. Pilot kapsamında read-only raporlar:
 * - Günlük satış özeti
 * - Tahsilat yöntemi kırılımı
 * - Açık bakiye (kısmi ödeme yapılmış sales)
 *
 * @security PII bu sözleşmede YOK. Raporlar tenant-scoped;
 *   backend actor.tenantId'den alınır. Rapor dışa aktarma
 *   audit üretir.
 * @since GOAL-076 (FAZ-7) temel finans raporları core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Tarih filtresi (date / dateRange)
 * -------------------------------------------------------------------------- */

export const reportDateRangeSchema = z.object({
  /** ISO date (YYYY-MM-DD). */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO date (YYYY-MM-DD). */
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ReportDateRange = z.infer<typeof reportDateRangeSchema>;

/* --------------------------------------------------------------------------
 * Günlük satış özeti
 * -------------------------------------------------------------------------- */

export const dailySalesReportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string(),
  clinicSalesTotal: z.string(),
  petshopSalesTotal: z.string(),
  combinedTotal: z.string(),
  clinicSaleCount: z.number().int().nonnegative(),
  petshopSaleCount: z.number().int().nonnegative(),
  /** Decimal string; combined net toplam (indirim sonrası). */
  netTotal: z.string(),
});
export type DailySalesReport = z.infer<typeof dailySalesReportSchema>;

/* --------------------------------------------------------------------------
 * Tahsilat yöntemi kırılımı
 * -------------------------------------------------------------------------- */

export const paymentMethodBreakdownItemSchema = z.object({
  method: z.enum(["cash", "card", "bank_transfer", "other"]),
  count: z.number().int().nonnegative(),
  totalAmount: z.string(),
});
export type PaymentMethodBreakdownItem = z.infer<
  typeof paymentMethodBreakdownItemSchema
>;

export const paymentMethodsReportSchema = z.object({
  dateRange: reportDateRangeSchema,
  currency: z.string(),
  totalCount: z.number().int().nonnegative(),
  totalAmount: z.string(),
  breakdown: z.array(paymentMethodBreakdownItemSchema),
});
export type PaymentMethodsReport = z.infer<typeof paymentMethodsReportSchema>;

/* --------------------------------------------------------------------------
 * Açık bakiye
 * -------------------------------------------------------------------------- */

export const openBalanceItemSchema = z.object({
  sourceType: z.enum(["clinic_sale", "petshop_sale"]),
  sourceId: z.string(),
  /** Decimal string; toplam tutar (sale). */
  totalAmount: z.string(),
  /** Decimal string; tahsil edilen tutar (payments completed). */
  paidAmount: z.string(),
  /** Decimal string; kalan bakiye. */
  openAmount: z.string(),
  /** ISO datetime; son payment. */
  lastPaymentAt: z.string().datetime().nullable(),
});
export type OpenBalanceItem = z.infer<typeof openBalanceItemSchema>;

export const openBalancesReportSchema = z.object({
  currency: z.string(),
  totalOpenAmount: z.string(),
  openItemCount: z.number().int().nonnegative(),
  items: z.array(openBalanceItemSchema),
});
export type OpenBalancesReport = z.infer<typeof openBalancesReportSchema>;

/* --------------------------------------------------------------------------
 * Dışa aktarma
 * -------------------------------------------------------------------------- */

export const reportExportTypeSchema = z.enum([
  "daily_sales",
  "payment_methods",
  "open_balances",
]);
export type ReportExportType = z.infer<typeof reportExportTypeSchema>;

export const reportExportInputSchema = z.object({
  type: reportExportTypeSchema,
  dateRange: reportDateRangeSchema.optional(),
  /** Çıktı formatı. */
  format: z.enum(["json", "csv"]).optional().default("json"),
});
export type ReportExportInput = z.infer<typeof reportExportInputSchema>;

export const reportExportResponseSchema = z.object({
  type: reportExportTypeSchema,
  format: z.enum(["json", "csv"]),
  /** Üretilen rapor (JSON) veya CSV gövdesi (string). */
  content: z.string(),
  generatedAt: z.string().datetime(),
});
export type ReportExportResponse = z.infer<typeof reportExportResponseSchema>;
