/**
 * @file Laboratuvar sonucu (lab result) API sözleşmesi.
 * @module @vetniva/contracts/lab-result
 *
 * @description GOAL-092 (FAZ-9) tenant bazlı laboratuvar sonuç
 * girişi. Bir lab order için **tek** bir sonuç kaydı; ham değer +
 * sayısal değer + referans aralığına göre işaretleme
 * (abnormalFlag) + dosya ekleri (PDF/görsel) + veteriner onayı.
 *
 * Yaşam döngüsü:
 * - `draft` → `pending_review` → `approved` (finalize)
 * - `approved` → `amended` (yeni revision oluşur)
 *
 * Onaylanmış (approved) sonuç değiştirilemez; düzeltme
 * `amend` ile yeni revision olarak yapılır.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Sonuç durum makinesi. */
export const labResultStatusSchema = z.enum([
  "draft",
  "pending_review",
  "approved",
  "amended",
]);
export type LabResultStatus = z.infer<typeof labResultStatusSchema>;

/** Referans dışı değer işareti. */
export const labAbnormalFlagSchema = z.enum([
  "normal",
  "low",
  "high",
  "critical_low",
  "critical_high",
  "abnormal",
]);
export type LabAbnormalFlag = z.infer<typeof labAbnormalFlagSchema>;

/* --------------------------------------------------------------------------
 * Yeni sonuç
 * --------------------------------------------------------------------------
 */

/**
 * Yeni lab sonucu.
 * - `value` zorunlu (ham değer string; ör. "12.5", "pozitif",
 *   "negatif").
 * - `valueNumeric` opsiyonel (4 ondalık decimal string; sayısal
 *   karşılaştırma için).
 * - `abnormalFlag` opsiyonel (default "normal").
 * - `notes` opsiyonel.
 * - `attachments` opsiyonel (dosya ID listesi; sözleşme
 *   seviyesinde string[]).
 */
export const labResultCreateInputSchema = z.object({
  value: z.string().min(1).max(200),
  valueNumeric: z
    .string()
    .regex(/^-?\d+(\.\d{1,4})?$/, {
      message: "valueNumeric decimal string olmalı (4 ondalık)",
    })
    .optional(),
  abnormalFlag: labAbnormalFlagSchema.optional().default("normal"),
  notes: z.string().max(2000).optional(),
  attachments: z.array(z.string().max(200)).max(20).optional(),
});
export type LabResultCreateInput = z.infer<
  typeof labResultCreateInputSchema
>;

/** Kısmi güncelleme. Yalnızca `draft` durumda. */
export const labResultUpdateInputSchema = z
  .object({
    value: z.string().min(1).max(200).optional(),
    valueNumeric: z
      .string()
      .regex(/^-?\d+(\.\d{1,4})?$/)
      .nullable()
      .optional(),
    abnormalFlag: labAbnormalFlagSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
    attachments: z.array(z.string().max(200)).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type LabResultUpdateInput = z.infer<
  typeof labResultUpdateInputSchema
>;

/** İncelemeye gönder. draft → pending_review. */
export const labResultSubmitInputSchema = z.object({
  notes: z.string().max(2000).optional(),
});
export type LabResultSubmitInput = z.infer<
  typeof labResultSubmitInputSchema
>;

/** Veteriner onayı. pending_review → approved. */
export const labResultApproveInputSchema = z.object({
  reviewNotes: z.string().max(2000).optional(),
});
export type LabResultApproveInput = z.infer<
  typeof labResultApproveInputSchema
>;

/** Amendment. approved → amended + yeni revision. */
export const labResultAmendInputSchema = z.object({
  reason: z.string().min(1).max(2000),
  value: z.string().min(1).max(200),
  valueNumeric: z
    .string()
    .regex(/^-?\d+(\.\d{1,4})?$/)
    .optional(),
  abnormalFlag: labAbnormalFlagSchema.optional().default("normal"),
  notes: z.string().max(2000).optional(),
  attachments: z.array(z.string().max(200)).max(20).optional(),
});
export type LabResultAmendInput = z.infer<
  typeof labResultAmendInputSchema
>;

/* --------------------------------------------------------------------------
 * Response
 * --------------------------------------------------------------------------
 */

export const labResultSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  labOrderId: z.string(),
  revision: z.number().int().positive(),
  value: z.string(),
  valueNumeric: z.string().nullable(),
  unit: z.string(),
  referenceRange: z.string().nullable(),
  abnormalFlag: labAbnormalFlagSchema,
  status: labResultStatusSchema,
  attachments: z.array(z.string()),
  notes: z.string().nullable(),
  enteredBy: z.string(),
  enteredAt: z.string().datetime(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewNotes: z.string().nullable(),
  amendsResultId: z.string().nullable(),
  amendmentReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LabResult = z.infer<typeof labResultSchema>;

/** Revizyon listesi (amendment geçmişi). */
export const labResultRevisionSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  status: labResultStatusSchema,
  enteredBy: z.string(),
  enteredAt: z.string().datetime(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  amendmentReason: z.string().nullable(),
});
export type LabResultRevision = z.infer<typeof labResultRevisionSchema>;

export const labResultListResponseSchema = z.object({
  items: z.array(labResultRevisionSchema),
  total: z.number().int().nonnegative(),
});
export type LabResultListResponse = z.infer<
  typeof labResultListResponseSchema
>;
