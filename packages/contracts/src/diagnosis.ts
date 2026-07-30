/**
 * @file Diagnosis (teşhis) API sözleşmesi.
 * @module @vetniva/contracts/diagnosis
 *
 * @description GOAL-043 teşhis ve problem listesi API sözleşmesi.
 * Bir muayeneye (examination) bağlı teşhis kayıtlarını temsil eder.
 * Yaşam döngüsü: `active` → {`resolved`, `chronic`, `ruled_out`}.
 * `differential` kategorisindeki kayıtlar `ruled_out` ile elenebilir.
 *
 * Soft delete: API sözleşmesinde `archivedAt` YOK; arşivlenen
 * kayıtlar listeleme yanıtından çıkar (repo filter). Klinik kayıt
 * append-only; fiziksel silme yoktur.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import { z } from "zod";

/** Teşhis kategorisi. */
export const diagnosisCategorySchema = z.enum([
  "primary",
  "secondary",
  "differential",
  "rule_out",
]);
export type DiagnosisCategory = z.infer<typeof diagnosisCategorySchema>;

/** Teşhis durumu (state machine). */
export const diagnosisStatusSchema = z.enum([
  "active",
  "resolved",
  "chronic",
  "ruled_out",
]);
export type DiagnosisStatus = z.infer<typeof diagnosisStatusSchema>;

/**
 * Yeni teşhis oluşturma isteği.
 * - `examinationId` zorunlu; service katmanı examination'ın aynı
 *   tenant'ta olduğunu doğrular (cross-tenant → 404).
 * - `code` ICD-10 vet kodu (FAZ-4'te opsiyonel, sonra zorunlu olabilir).
 */
export const diagnosisCreateInputSchema = z.object({
  examinationId: z.string().min(1),
  name: z.string().min(1).max(500),
  category: diagnosisCategorySchema,
  code: z.string().min(1).max(50).optional(),
  notes: z.string().max(2000).optional(),
});
export type DiagnosisCreateInput = z.infer<typeof diagnosisCreateInputSchema>;

/** API response şeması. */
export const diagnosisSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  examinationId: z.string(),
  patientId: z.string(),
  /** ICD-10 vet kodu (FAZ-4 opsiyonel). */
  code: z.string().nullable(),
  name: z.string(),
  category: diagnosisCategorySchema,
  status: diagnosisStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  /** ISO 8601 datetime; null = hâlâ aktif veya kronik. */
  resolvedAt: z.string().datetime().nullable(),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

/** Patient üzerinden liste filtreleri. */
export const diagnosisPatientListFiltersSchema = z.object({
  /** Status filtresi; opsiyonel. */
  status: diagnosisStatusSchema.optional(),
  /** Yalnızca arşivlenmemiş kayıtları getir (default true). */
  includeArchived: z.coerce.boolean().default(false),
});
export type DiagnosisPatientListFilters = z.infer<
  typeof diagnosisPatientListFiltersSchema
>;
