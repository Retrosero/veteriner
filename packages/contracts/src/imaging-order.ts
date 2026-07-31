/**
 * @file Görüntüleme isteği (imaging order) + rapor API sözleşmesi.
 * @module @vetniva/contracts/imaging-order
 *
 * @description GOAL-093 (FAZ-9) tenant bazlı görüntüleme isteği.
 * Bir muayene veya yatıştan açılan tek bir görüntüleme
 * (röntgen, ultrason, CT, MRI, endoskopi, diğer) siparişi:
 * katalogdan `imagingTestId` ile referans alır, **snapshot**'unu
 * (code, name, modality, bodyPart, price) order üzerinde
 * dondurur.
 *
 * State machine:
 * - `ordered` → `scheduled` → `performed` → `reported` → `completed`
 * - `ordered | scheduled` → `cancelled`
 * - `reported` → `amended` (yeni rapor revizyonu)
 *
 * Rapor alt-akışı:
 * - `report` alanı opsiyonel; `reported` duruma geçişte set edilir.
 * - `reportApproved` ve `reportApprovedBy/At` onay sonrası set edilir.
 * - Rapor içeriği (findings, impression, recommendation) order
 *   üzerinde append-only; düzeltme `amend` ile yeni revision ile
 *   yapılır. Onaylanmış (approved) rapor değiştirilemez.
 * - `portalVisible` ile hasta sahibi portalında görünürlük
 *   ayrıca kontrol edilir; sadece approved + portalVisible=true
 *   olan raporlar portal'da listelenir.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Görüntüleme modu. */
export const imagingModalitySchema = z.enum([
  "xray",
  "ultrasound",
  "ct",
  "mri",
  "endoscopy",
  "fluoroscopy",
  "other",
]);
export type ImagingModality = z.infer<typeof imagingModalitySchema>;

/** Sipariş durum makinesi. */
export const imagingOrderStatusSchema = z.enum([
  "ordered",
  "scheduled",
  "performed",
  "reported",
  "completed",
  "cancelled",
  "amended",
]);
export type ImagingOrderStatus = z.infer<typeof imagingOrderStatusSchema>;

/** Öncelik seviyesi. */
export const imagingOrderPrioritySchema = z.enum([
  "routine",
  "urgent",
  "stat",
]);
export type ImagingOrderPriority = z.infer<
  typeof imagingOrderPrioritySchema
>;

/** İsteğin nereden açıldığı. */
export const imagingOrderSourceTypeSchema = z.enum([
  "examination",
  "hospitalization",
  "surgery",
  "manual",
]);
export type ImagingOrderSourceType = z.infer<
  typeof imagingOrderSourceTypeSchema
>;

/** Kontrast madde kullanımı. */
export const imagingContrastUseSchema = z.enum([
  "none",
  "iv",
  "oral",
  "rectal",
  "other",
]);
export type ImagingContrastUse = z.infer<typeof imagingContrastUseSchema>;

/* --------------------------------------------------------------------------
 * Yeni görüntüleme isteği
 * --------------------------------------------------------------------------
 */

/**
 * Yeni görüntüleme isteği.
 * - `patientId` zorunlu.
 * - `imagingTestId` zorunlu (katalogdan; pasif katalog reddedilir).
 * - `sourceType` zorunlu; `manual` her zaman kullanılabilir.
 * - `priority` opsiyonel (default "routine").
 * - `bodyPart` opsiyonel (katalog boş ise serbest metin).
 * - `clinicalInfo` opsiyonel (klinik endikasyon notu).
 * - `notes` opsiyonel.
 */
export const imagingOrderCreateInputSchema = z.object({
  patientId: z.string().uuid(),
  imagingTestId: z.string().uuid(),
  sourceType: imagingOrderSourceTypeSchema,
  sourceId: z.string().uuid().optional(),
  priority: imagingOrderPrioritySchema.optional().default("routine"),
  bodyPart: z.string().max(200).optional(),
  clinicalInfo: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});
export type ImagingOrderCreateInput = z.infer<
  typeof imagingOrderCreateInputSchema
>;

/** Planlama. ordered → scheduled. */
export const imagingOrderScheduleInputSchema = z.object({
  scheduledAt: z.string().datetime(),
  scheduledLocation: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});
export type ImagingOrderScheduleInput = z.infer<
  typeof imagingOrderScheduleInputSchema
>;

/** Çekim. scheduled → performed. */
export const imagingOrderPerformInputSchema = z.object({
  performedAt: z.string().datetime().optional(),
  performedByUserId: z.string().uuid().optional(),
  contrastUse: imagingContrastUseSchema.optional().default("none"),
  attachments: z.array(z.string().max(200)).max(50).optional(),
  notes: z.string().max(2000).optional(),
});
export type ImagingOrderPerformInput = z.infer<
  typeof imagingOrderPerformInputSchema
>;

/** Rapor yazımı. performed → reported. */
export const imagingOrderReportInputSchema = z.object({
  findings: z.string().min(1).max(20000),
  impression: z.string().min(1).max(20000),
  recommendation: z.string().max(20000).optional(),
  attachments: z.array(z.string().max(200)).max(50).optional(),
});
export type ImagingOrderReportInput = z.infer<
  typeof imagingOrderReportInputSchema
>;

/** Rapor onayı. reported (draft review) → reviewed/approved. */
export const imagingOrderApproveReportInputSchema = z.object({
  reviewNotes: z.string().max(2000).optional(),
  portalVisible: z.boolean().optional().default(false),
});
export type ImagingOrderApproveReportInput = z.infer<
  typeof imagingOrderApproveReportInputSchema
>;

/** Rapor düzeltme (amendment). reported/approved → amended + yeni revision. */
export const imagingOrderAmendReportInputSchema = z.object({
  reason: z.string().min(1).max(2000),
  findings: z.string().min(1).max(20000),
  impression: z.string().min(1).max(20000),
  recommendation: z.string().max(20000).optional(),
  attachments: z.array(z.string().max(200)).max(50).optional(),
  portalVisible: z.boolean().optional().default(false),
});
export type ImagingOrderAmendReportInput = z.infer<
  typeof imagingOrderAmendReportInputSchema
>;

/** Tamamlama. reported → completed. */
export const imagingOrderCompleteInputSchema = z.object({
  notes: z.string().max(2000).optional(),
});
export type ImagingOrderCompleteInput = z.infer<
  typeof imagingOrderCompleteInputSchema
>;

/** İptal. ordered | scheduled → cancelled. */
export const imagingOrderCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type ImagingOrderCancelInput = z.infer<
  typeof imagingOrderCancelInputSchema
>;

/* --------------------------------------------------------------------------
 * Rapor (alt varlık) şeması
 * --------------------------------------------------------------------------
 */

/** Tek bir rapor revizyonu. */
export const imagingReportSchema = z.object({
  revision: z.number().int().positive(),
  findings: z.string(),
  impression: z.string(),
  recommendation: z.string().nullable(),
  attachments: z.array(z.string()),
  enteredBy: z.string(),
  enteredAt: z.string().datetime(),
  amendmentReason: z.string().nullable(),
  approved: z.boolean(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  portalVisible: z.boolean(),
  reviewNotes: z.string().nullable(),
});
export type ImagingReport = z.infer<typeof imagingReportSchema>;

/* --------------------------------------------------------------------------
 * Response
 * --------------------------------------------------------------------------
 */

export const imagingOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  imagingTestId: z.string(),
  // Katalog snapshot
  imagingTestCode: z.string(),
  imagingTestName: z.string(),
  modality: imagingModalitySchema,
  bodyPart: z.string().nullable(),
  price: z.string(),
  sourceType: imagingOrderSourceTypeSchema,
  sourceId: z.string().nullable(),
  priority: imagingOrderPrioritySchema,
  status: imagingOrderStatusSchema,
  // Planlama + çekim
  scheduledAt: z.string().datetime().nullable(),
  scheduledLocation: z.string().nullable(),
  performedAt: z.string().datetime().nullable(),
  performedByUserId: z.string().nullable(),
  contrastUse: imagingContrastUseSchema.nullable(),
  clinicalInfo: z.string().nullable(),
  attachments: z.array(z.string()),
  // Rapor (en son revizyon; null ise henüz rapor yok)
  report: imagingReportSchema.nullable(),
  reportRevisions: z.array(imagingReportSchema),
  // İptal
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type ImagingOrder = z.infer<typeof imagingOrderSchema>;

/* --------------------------------------------------------------------------
 * List & filter
 * --------------------------------------------------------------------------
 */

export const imagingOrderFiltersSchema = z.object({
  status: imagingOrderStatusSchema.optional(),
  modality: imagingModalitySchema.optional(),
  patientId: z.string().uuid().optional(),
  sourceType: imagingOrderSourceTypeSchema.optional(),
  sourceId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ImagingOrderFilters = z.infer<
  typeof imagingOrderFiltersSchema
>;

export const imagingOrderListResponseSchema = z.object({
  items: z.array(imagingOrderSchema),
  total: z.number().int().nonnegative(),
});
export type ImagingOrderListResponse = z.infer<
  typeof imagingOrderListResponseSchema
>;
