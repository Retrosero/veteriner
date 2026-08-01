/**
 * @file Ameliyat planlama (surgery plan) API sözleşmesi.
 * @module @vetniva/contracts/surgery-plan
 *
 * @description GOAL-080 (FAZ-8) ameliyat planlama için Zod
 * şemaları + tipler. Hasta (patient) için ameliyat planı +
 * takvim kaydı; randevu (appointment) ile bağlantı opsiyonel.
 *
 * Yaşam döngüsü:
 * - `scheduled`  — plan oluşturulmuş; tarih/saat gelecekte.
 * - `in_progress` — ameliyat başladı; (ekip onayı sonrası).
 * - `completed`  — ameliyat tamamlandı.
 * - `cancelled`  — plan iptal edildi.
 *
 * MVP'de ekip (assistant listesi) ve oda (room) bilgisi
 * `notes` içinde serbest metin olarak tutulur; ileride
 * ayrı tablo/alan eklenebilir.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

export const surgeryPlanStatusSchema = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
export type SurgeryPlanStatus = z.infer<typeof surgeryPlanStatusSchema>;

/* --------------------------------------------------------------------------
 * Yeni plan
 * -------------------------------------------------------------------------- */

/**
 * Yeni ameliyat planı.
 * - `patientId` zorunlu (Patient.id UUID).
 * - `leadSurgeonUserId` zorunlu (Sorumlu veteriner user id).
 * - `operationType` zorunlu (serbest metin; ör. "ovariohysterectomy").
 * - `scheduledAt` zorunlu (ISO datetime; gelecekte olmalı — 422
 *   VET-SURGERY-0006).
 * - `appointmentId` opsiyonel (randevu bağlantısı).
 * - `notes` opsiyonel (ön hazırlık + risk birleşik).
 */
export const surgeryPlanCreateInputSchema = z.object({
  patientId: z.string().uuid(),
  leadSurgeonUserId: z.string().min(1).max(100),
  operationType: z.string().min(1).max(200),
  scheduledAt: z.string().datetime(),
  appointmentId: z.string().min(1).max(100).optional(),
  notes: z.string().max(4000).optional(),
});
export type SurgeryPlanCreateInput = z.infer<
  typeof surgeryPlanCreateInputSchema
>;

/** Plan kısmi güncelleme (yalnızca scheduled durumda). */
export const surgeryPlanUpdateInputSchema = z
  .object({
    operationType: z.string().min(1).max(200).optional(),
    scheduledAt: z.string().datetime().optional(),
    appointmentId: z.string().min(1).max(100).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type SurgeryPlanUpdateInput = z.infer<
  typeof surgeryPlanUpdateInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const surgeryPlanSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string().uuid(),
  leadSurgeonUserId: z.string(),
  operationType: z.string(),
  scheduledAt: z.string().datetime(),
  appointmentId: z.string().nullable(),
  status: surgeryPlanStatusSchema,
  notes: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  startedBy: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  completedBy: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type SurgeryPlan = z.infer<typeof surgeryPlanSchema>;

/** Liste filtreleri. */
export const surgeryPlanFiltersSchema = z.object({
  status: surgeryPlanStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  leadSurgeonUserId: z.string().optional(),
  /** Tarih aralığı (ISO date, YYYY-MM-DD). */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type SurgeryPlanFilters = z.infer<typeof surgeryPlanFiltersSchema>;

/** Liste response şeması. */
export const surgeryPlanListResponseSchema = z.object({
  items: z.array(surgeryPlanSchema),
  total: z.number().int().nonnegative(),
});
export type SurgeryPlanListResponse = z.infer<
  typeof surgeryPlanListResponseSchema
>;

/** İptal isteği. */
export const surgeryPlanCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type SurgeryPlanCancelInput = z.infer<
  typeof surgeryPlanCancelInputSchema
>;
