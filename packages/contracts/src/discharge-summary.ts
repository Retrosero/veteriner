/**
 * @file Gözlem kayıtları ve taburcu özeti (observation +
 * discharge summary) API sözleşmesi.
 * @module @vetniva/contracts/discharge-summary
 *
 * @description GOAL-086 (FAZ-8) yatış sırasında gözlem kayıtları
 * (append-only) ve taburcu özeti. Yatış (hospitalizationId)
 * ile bağlı; her yatış için en fazla bir taburcu özeti.
 *
 * Varlıklar:
 * - `Observation` — kısa zaman damgalı not (muayene bulgusu,
 *   ateş ölçümü, iştah, vb.). Append-only.
 * - `DischargeSummary` — taburcu özeti (klinik özet + tedavi
 *   + ev talimatları + ilaçlar + kontrol tarihi + portal
 *   paylaşımı + PDF). Bir yatışa en fazla bir tane. Finalize
 *   sonrası readonly; düzeltme yeni revision ile (amendment).
 *
 * Append-only: iptal/değiştirme yerine amendment; gözetim
 *   kayıtları hiç silinmez.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-086 (FAZ-8) gözlem ve taburcu özeti core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

export const observationKindSchema = z.enum([
  "vital",
  "exam",
  "behavior",
  "intake",
  "output",
  "treatment",
  "note",
]);
export type ObservationKind = z.infer<typeof observationKindSchema>;

export const dischargeSummaryStatusSchema = z.enum([
  "draft",
  "finalized",
  "amended",
]);
export type DischargeSummaryStatus = z.infer<
  typeof dischargeSummaryStatusSchema
>;

/** İlaç bilgisi (summary ilaçları için). */
export const dischargeMedicationItemSchema = z.object({
  name: z.string().min(1).max(200),
  dose: z.string().min(1).max(64),
  frequency: z.string().min(1).max(200),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  notes: z.string().max(500).optional(),
});
export type DischargeMedicationItem = z.infer<
  typeof dischargeMedicationItemSchema
>;

/* --------------------------------------------------------------------------
 * Observation
 * --------------------------------------------------------------------------
 */

/**
 * Yeni gözlem kaydı.
 * - `kind` zorunlu (vital/exam/behavior/...).
 * - `observedAt` opsiyonel (default: now).
 * - `value` zorunlu (serbest metin; ör. "38.5°C", "iştah normal").
 * - `notes` opsiyonel.
 */
export const observationCreateInputSchema = z.object({
  kind: observationKindSchema,
  observedAt: z.string().datetime().optional(),
  value: z.string().min(1).max(2000),
  notes: z.string().max(2000).optional(),
});
export type ObservationCreateInput = z.infer<
  typeof observationCreateInputSchema
>;

/** Gözlem response. */
export const observationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  hospitalizationId: z.string(),
  kind: observationKindSchema,
  observedAt: z.string().datetime(),
  value: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type Observation = z.infer<typeof observationSchema>;

/* --------------------------------------------------------------------------
 * DischargeSummary
 * --------------------------------------------------------------------------
 */

/**
 * Yeni taburcu özeti.
 * - `clinicalSummary` zorunlu.
 * - `treatments` opsiyonel.
 * - `homeInstructions` opsiyonel.
 * - `medications` opsiyonel (array).
 * - `followUpDate` opsiyonel (ISO date).
 * - `notes` opsiyonel.
 */
export const dischargeSummaryCreateInputSchema = z.object({
  clinicalSummary: z.string().min(1).max(8000),
  treatments: z.string().max(8000).optional(),
  homeInstructions: z.string().max(8000).optional(),
  medications: z.array(dischargeMedicationItemSchema).optional(),
  followUpDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-AA-GG formatında olmalı")
    .optional(),
  notes: z.string().max(4000).optional(),
});
export type DischargeSummaryCreateInput = z.infer<
  typeof dischargeSummaryCreateInputSchema
>;

/** Taburcu özeti güncelleme (yalnızca draft). */
export const dischargeSummaryUpdateInputSchema = z
  .object({
    clinicalSummary: z.string().min(1).max(8000).optional(),
    treatments: z.string().max(8000).nullable().optional(),
    homeInstructions: z.string().max(8000).nullable().optional(),
    medications: z.array(dischargeMedicationItemSchema).nullable().optional(),
    followUpDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type DischargeSummaryUpdateInput = z.infer<
  typeof dischargeSummaryUpdateInputSchema
>;

/** Finalize isteği. */
export const dischargeSummaryFinalizeInputSchema = z.object({
  notes: z.string().max(4000).optional(),
});
export type DischargeSummaryFinalizeInput = z.infer<
  typeof dischargeSummaryFinalizeInputSchema
>;

/** Amendment isteği. */
export const dischargeSummaryAmendInputSchema = z.object({
  reason: z.string().min(1).max(2000),
  notes: z.string().max(4000).optional(),
});
export type DischargeSummaryAmendInput = z.infer<
  typeof dischargeSummaryAmendInputSchema
>;

/** Taburcu özeti response. */
export const dischargeSummarySchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  hospitalizationId: z.string(),
  status: dischargeSummaryStatusSchema,
  clinicalSummary: z.string(),
  treatments: z.string().nullable(),
  homeInstructions: z.string().nullable(),
  medications: z.array(dischargeMedicationItemSchema),
  followUpDate: z.string().nullable(),
  portalShared: z.boolean(),
  portalSharedAt: z.string().datetime().nullable(),
  pdfGenerated: z.boolean(),
  pdfGeneratedAt: z.string().datetime().nullable(),
  finalizedAt: z.string().datetime().nullable(),
  finalizedBy: z.string().nullable(),
  amendsSummaryId: z.string().nullable(),
  amendmentReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type DischargeSummary = z.infer<typeof dischargeSummarySchema>;

/* --------------------------------------------------------------------------
 * List & filter
 * --------------------------------------------------------------------------
 */

export const observationFiltersSchema = z.object({
  hospitalizationId: z.string().min(1).max(100).optional(),
  kind: observationKindSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ObservationFilters = z.infer<typeof observationFiltersSchema>;

export const observationListResponseSchema = z.object({
  items: z.array(observationSchema),
  total: z.number().int().nonnegative(),
});
export type ObservationListResponse = z.infer<
  typeof observationListResponseSchema
>;
