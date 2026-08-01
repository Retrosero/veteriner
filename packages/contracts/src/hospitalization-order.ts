/**
 * @file Yatış order ve uygulama kayıtları (hospitalization order)
 * API sözleşmesi.
 * @module @vetniva/contracts/hospitalization-order
 *
 * @description GOAL-085 (FAZ-8) yatışta order (ilaç/beslenme/
 * ölçüm/bakım/kontrol) oluşturma ve uygulama kayıtları. Bir yatış
 * (hospitalizationId) için N order; her order için N zamanlanmış
 * uygulama kaydı (schedule). Planlanan ve uygulanan ayrı
 * tutulur; kaçırılan/geciken order `overdue` filtresi ile
 * görünür.
 *
 * Varlıklar:
 * - `HospitalizationOrder` — ana order kaydı (tip + talimat +
 *   öncelik + aktiflik aralığı).
 * - `HospitalizationOrderSchedule` — zamanlanmış uygulama
 *   kaydı. `appliedAt` veya `skippedAt` set edilince kapalı
 *   sayılır. İkisi de null ise "beklemede" (pending).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

export const hospitalizationOrderTypeSchema = z.enum([
  "medication",
  "feeding",
  "measurement",
  "care",
  "check",
  "other",
]);
export type HospitalizationOrderType = z.infer<
  typeof hospitalizationOrderTypeSchema
>;

export const hospitalizationOrderStatusSchema = z.enum([
  "active",
  "cancelled",
  "completed",
]);
export type HospitalizationOrderStatus = z.infer<
  typeof hospitalizationOrderStatusSchema
>;

export const hospitalizationOrderPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type HospitalizationOrderPriority = z.infer<
  typeof hospitalizationOrderPrioritySchema
>;

/* --------------------------------------------------------------------------
 * HospitalizationOrder
 * --------------------------------------------------------------------------
 */

/**
 * Yeni yatış order.
 * - `hospitalizationId` zorunlu.
 * - `orderType` zorunlu (medication/feeding/measurement/care/check/other).
 * - `instructions` zorunlu (serbest metin; ör. "200mg Amoxicillin PO").
 * - `frequency` opsiyonel (serbest metin; ör. "every 8h", "BID").
 * - `priority` opsiyonel (default medium).
 * - `startsAt` opsiyonel (default: now).
 * - `endsAt` opsiyonel.
 * - `notes` opsiyonel.
 */
export const hospitalizationOrderCreateInputSchema = z.object({
  hospitalizationId: z.string().min(1).max(100),
  orderType: hospitalizationOrderTypeSchema,
  instructions: z.string().min(1).max(4000),
  frequency: z.string().max(200).optional(),
  priority: hospitalizationOrderPrioritySchema.optional().default("medium"),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type HospitalizationOrderCreateInput = z.infer<
  typeof hospitalizationOrderCreateInputSchema
>;

/** Order kısmi güncelleme (yalnızca active). */
export const hospitalizationOrderUpdateInputSchema = z
  .object({
    instructions: z.string().min(1).max(4000).optional(),
    frequency: z.string().max(200).nullable().optional(),
    priority: hospitalizationOrderPrioritySchema.optional(),
    endsAt: z.string().datetime().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type HospitalizationOrderUpdateInput = z.infer<
  typeof hospitalizationOrderUpdateInputSchema
>;

/** Order iptal isteği. */
export const hospitalizationOrderCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type HospitalizationOrderCancelInput = z.infer<
  typeof hospitalizationOrderCancelInputSchema
>;

/** Order response. */
export const hospitalizationOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  hospitalizationId: z.string(),
  orderType: hospitalizationOrderTypeSchema,
  instructions: z.string(),
  frequency: z.string().nullable(),
  priority: hospitalizationOrderPrioritySchema,
  status: hospitalizationOrderStatusSchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type HospitalizationOrder = z.infer<typeof hospitalizationOrderSchema>;

/* --------------------------------------------------------------------------
 * HospitalizationOrderSchedule
 * --------------------------------------------------------------------------
 */

/**
 * Yeni zamanlanmış uygulama kaydı.
 * - `scheduledFor` zorunlu (ISO datetime).
 * - `notes` opsiyonel.
 */
export const hospitalizationOrderScheduleCreateInputSchema = z.object({
  scheduledFor: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});
export type HospitalizationOrderScheduleCreateInput = z.infer<
  typeof hospitalizationOrderScheduleCreateInputSchema
>;

/** Uygulama kaydı. */
export const hospitalizationOrderApplyInputSchema = z.object({
  appliedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type HospitalizationOrderApplyInput = z.infer<
  typeof hospitalizationOrderApplyInputSchema
>;

/** Skip kaydı (kaçırılan/geciken). */
export const hospitalizationOrderSkipInputSchema = z.object({
  skippedAt: z.string().datetime().optional(),
  reason: z.string().min(1).max(2000),
});
export type HospitalizationOrderSkipInput = z.infer<
  typeof hospitalizationOrderSkipInputSchema
>;

/** Schedule response. */
export const hospitalizationOrderScheduleSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  orderId: z.string(),
  scheduledFor: z.string().datetime(),
  appliedAt: z.string().datetime().nullable(),
  appliedByUserId: z.string().nullable(),
  skippedAt: z.string().datetime().nullable(),
  skippedByUserId: z.string().nullable(),
  skipReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type HospitalizationOrderSchedule = z.infer<
  typeof hospitalizationOrderScheduleSchema
>;

/* --------------------------------------------------------------------------
 * List & filter
 * --------------------------------------------------------------------------
 */

export const hospitalizationOrderFiltersSchema = z.object({
  hospitalizationId: z.string().optional(),
  orderType: hospitalizationOrderTypeSchema.optional(),
  status: hospitalizationOrderStatusSchema.optional(),
  priority: hospitalizationOrderPrioritySchema.optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type HospitalizationOrderFilters = z.infer<
  typeof hospitalizationOrderFiltersSchema
>;

/** Schedule filtresi. */
export const hospitalizationOrderScheduleFiltersSchema = z.object({
  orderId: z.string().optional(),
  status: z.enum(["pending", "applied", "skipped", "overdue"]).optional(),
  /** ISO datetime; bu tarihten önceki pending kayıtlar "overdue" sayılır. */
  asOf: z.string().datetime().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type HospitalizationOrderScheduleFilters = z.infer<
  typeof hospitalizationOrderScheduleFiltersSchema
>;

export const hospitalizationOrderListResponseSchema = z.object({
  items: z.array(hospitalizationOrderSchema),
  total: z.number().int().nonnegative(),
});
export type HospitalizationOrderListResponse = z.infer<
  typeof hospitalizationOrderListResponseSchema
>;

export const hospitalizationOrderScheduleListResponseSchema = z.object({
  items: z.array(hospitalizationOrderScheduleSchema),
  total: z.number().int().nonnegative(),
});
export type HospitalizationOrderScheduleListResponse = z.infer<
  typeof hospitalizationOrderScheduleListResponseSchema
>;

/** Detay response — order + tüm schedule kayıtları. */
export const hospitalizationOrderDetailSchema = z.object({
  order: hospitalizationOrderSchema,
  schedules: z.array(hospitalizationOrderScheduleSchema),
});
export type HospitalizationOrderDetail = z.infer<
  typeof hospitalizationOrderDetailSchema
>;
