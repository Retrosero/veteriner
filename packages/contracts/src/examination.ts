/**
 * @file Examination (muayene) API sözleşmesi.
 * @module @vetniva/contracts/examination
 *
 * @description GOAL-040 muayene başlatma ve yaşam döngüsü API
 * sözleşmesi. Zod şemaları + tipler. Backend (request/response
 * doğrulama) ve frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Muayene, bir appointment'a bağlı klinik kayıt entity'sidir.
 * Yaşam döngüsü: `in_progress` → `completed` → (imza atıldı) →
 * `amended` (düzeltme sonrası, yeni ExaminationAmend kaydı ile).
 * İmza atıldıktan sonra UPDATE/DELETE tetiklenir (FAZ-0'da no-op
 * flag); düzeltme yalnızca yeni amendment kaydı üzerinden yapılır
 * (append-only klinik kayıt politikası).
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
 */

import { z } from "zod";

/** Muayene türü. Klinik pilot kapsamı. */
export const examinationTypeSchema = z.enum([
  "consultation",
  "follow_up",
  "emergency",
  "routine_check",
]);
export type ExaminationType = z.infer<typeof examinationTypeSchema>;

/** Muayene durumu. */
export const examinationStatusSchema = z.enum([
  "in_progress",
  "completed",
  "amended",
]);
export type ExaminationStatus = z.infer<typeof examinationStatusSchema>;

/**
 * Yeni muayene başlatma isteği.
 * - `appointmentId` zorunlu: muayene randevuya bağlıdır.
 * - Service katmanı appointment'ın aynı tenant'ta olduğunu doğrular
 *   (cross-tenant → 404).
 * - patientId / veterinarianId appointment'tan türetilir.
 */
export const examinationCreateInputSchema = z.object({
  appointmentId: z.string().min(1),
  type: examinationTypeSchema,
  chiefComplaint: z.string().min(1).max(2000),
});
export type ExaminationCreateInput = z.infer<
  typeof examinationCreateInputSchema
>;

/** Muayene düzeltme (amend) isteği. */
export const examinationAmendInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type ExaminationAmendInput = z.infer<typeof examinationAmendInputSchema>;

/** API response şeması. */
export const examinationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  veterinarianId: z.string(),
  appointmentId: z.string().nullable(),
  status: examinationStatusSchema,
  type: examinationTypeSchema,
  chiefComplaint: z.string(),
  /** ISO 8601 datetime — muayene başlangıç zamanı. */
  startedAt: z.string().datetime(),
  /** ISO 8601 datetime — muayene tamamlanma zamanı; null = hâlâ devam ediyor. */
  completedAt: z.string().datetime().nullable(),
  /** ISO 8601 datetime — veteriner hekimin imzaladığı zaman; null = imzalanmamış. */
  signedAt: z.string().datetime().nullable(),
  /** İmzalayan kullanıcı ID. */
  signedBy: z.string().nullable(),
  /** ISO 8601 datetime — kayıt oluşturma zamanı. */
  createdAt: z.string().datetime(),
  /** ISO 8601 datetime — son güncelleme zamanı. */
  updatedAt: z.string().datetime(),
});
export type Examination = z.infer<typeof examinationSchema>;

/** Muayene amendment (düzeltme) kaydı şeması. */
export const examinationAmendSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  examinationId: z.string(),
  reason: z.string(),
  amendedBy: z.string(),
  amendedAt: z.string().datetime(),
  /** İmza öncesi durumun referansı (append-only). */
  previousSignedAt: z.string().datetime().nullable(),
  previousSignedBy: z.string().nullable(),
});
export type ExaminationAmend = z.infer<typeof examinationAmendSchema>;

/** Liste filtreleri. */
export const examinationFiltersSchema = z.object({
  patientId: z.string().optional(),
  veterinarianId: z.string().optional(),
  status: examinationStatusSchema.optional(),
  /** ISO 8601 datetime (UTC). */
  from: z.string().datetime().optional(),
  /** ISO 8601 datetime (UTC). */
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ExaminationFilters = z.infer<typeof examinationFiltersSchema>;

/** Liste response şeması. */
export const examinationListResponseSchema = z.object({
  items: z.array(examinationSchema),
  total: z.number().int().nonnegative(),
});
export type ExaminationListResponse = z.infer<
  typeof examinationListResponseSchema
>;
