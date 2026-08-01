/**
 * @file Laboratuvar isteği (lab order) + numune alımı API sözleşmesi.
 * @module @vetniva/contracts/lab-order
 *
 * @description GOAL-091 (FAZ-9) tenant bazlı laboratuvar isteği.
 * Bir muayene veya yatıştan açılan tek bir test siparişi:
 * katalogdan `labTestId` ile referans alır, **snapshot**'unu
 * (code, name, sampleType, unit, referenceRange, price) order
 * üzerinde dondurur. Sonuç değerleri bu sözleşmede YOK
 * (GOAL-092 sonuç girişi).
 *
 * Yaşam döngüsü:
 * - `ordered` → `collected` → `processing` → `completed`
 * - `ordered | collected` → `cancelled` (iptal)
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Lab isteği durum makinesi. */
export const labOrderStatusSchema = z.enum([
  "ordered",
  "collected",
  "processing",
  "completed",
  "cancelled",
]);
export type LabOrderStatus = z.infer<typeof labOrderStatusSchema>;

/** Öncelik seviyesi. */
export const labOrderPrioritySchema = z.enum(["routine", "urgent", "stat"]);
export type LabOrderPriority = z.infer<typeof labOrderPrioritySchema>;

/** Numune kaynağı — order'ın nereden açıldığı. */
export const labOrderSourceTypeSchema = z.enum([
  "examination",
  "hospitalization",
  "surgery",
  "manual",
]);
export type LabOrderSourceType = z.infer<typeof labOrderSourceTypeSchema>;

/** Numune kalitesi. */
export const labOrderSampleQualitySchema = z.enum([
  "ok",
  "hemolyzed",
  "insufficient",
  "contaminated",
  "other",
]);
export type LabOrderSampleQuality = z.infer<typeof labOrderSampleQualitySchema>;

/* --------------------------------------------------------------------------
 * Yeni lab isteği
 * --------------------------------------------------------------------------
 */

/**
 * Yeni lab isteği.
 * - `patientId` zorunlu.
 * - `labTestId` zorunlu (katalogdan; pasif katalog reddedilir).
 * - `sourceType` zorunlu (`manual` her zaman kullanılabilir; diğer
 *   source'lar MVP'de log-only — yani `sourceId` opsiyonel).
 * - `priority` opsiyonel (default "routine").
 * - `notes` opsiyonel.
 */
export const labOrderCreateInputSchema = z.object({
  patientId: z.string().uuid(),
  labTestId: z.string().uuid(),
  sourceType: labOrderSourceTypeSchema,
  sourceId: z.string().uuid().optional(),
  priority: labOrderPrioritySchema.optional().default("routine"),
  notes: z.string().max(2000).optional(),
});
export type LabOrderCreateInput = z.infer<typeof labOrderCreateInputSchema>;

/** Numune alımı. ordered → collected. */
export const labOrderCollectSampleInputSchema = z.object({
  collectedAt: z.string().datetime(),
  collectedByUserId: z.string().uuid(),
  sampleQuality: labOrderSampleQualitySchema.optional().default("ok"),
  notes: z.string().max(2000).optional(),
});
export type LabOrderCollectSampleInput = z.infer<
  typeof labOrderCollectSampleInputSchema
>;

/** Numune laboratuvara gönderildi. collected → processing. */
export const labOrderStartProcessingInputSchema = z.object({
  sentAt: z.string().datetime().optional(),
  labReference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});
export type LabOrderStartProcessingInput = z.infer<
  typeof labOrderStartProcessingInputSchema
>;

/** Manuel tamamlama (henüz sonuç girilmedi — placeholder). */
export const labOrderCompleteInputSchema = z.object({
  notes: z.string().max(2000).optional(),
});
export type LabOrderCompleteInput = z.infer<typeof labOrderCompleteInputSchema>;

/** İptal. */
export const labOrderCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type LabOrderCancelInput = z.infer<typeof labOrderCancelInputSchema>;

/* --------------------------------------------------------------------------
 * Response
 * --------------------------------------------------------------------------
 */

export const labOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  labTestId: z.string(),
  // Katalog snapshot'ı (order'ın oluşturulduğu andaki hali)
  labTestCode: z.string(),
  labTestName: z.string(),
  sampleType: z.string(),
  unit: z.string(),
  referenceRange: z.string().nullable(),
  price: z.string(),
  sourceType: labOrderSourceTypeSchema,
  sourceId: z.string().nullable(),
  priority: labOrderPrioritySchema,
  status: labOrderStatusSchema,
  // Numune bilgileri
  collectedAt: z.string().datetime().nullable(),
  collectedByUserId: z.string().nullable(),
  sampleQuality: labOrderSampleQualitySchema.nullable(),
  processingStartedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type LabOrder = z.infer<typeof labOrderSchema>;

/* --------------------------------------------------------------------------
 * List & filter
 * --------------------------------------------------------------------------
 */

export const labOrderFiltersSchema = z.object({
  status: labOrderStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  sourceType: labOrderSourceTypeSchema.optional(),
  sourceId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type LabOrderFilters = z.infer<typeof labOrderFiltersSchema>;

export const labOrderListResponseSchema = z.object({
  items: z.array(labOrderSchema),
  total: z.number().int().nonnegative(),
});
export type LabOrderListResponse = z.infer<typeof labOrderListResponseSchema>;
