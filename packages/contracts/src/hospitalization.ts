/**
 * @file Yatış ve kafes yönetimi (hospitalization) API sözleşmesi.
 * @module @vetniva/contracts/hospitalization
 *
 * @description GOAL-084 (FAZ-8) hayvan yatışı, kafes ve yaşam
 * döngüsü. Bir hasta (patientId) için tek bir aktif yatış;
 * kafes atamaları (cage-assignments) append-only zaman aralığı
 * kayıtlarıdır. Aynı kafeste zaman çakışması engellenir.
 *
 * Varlıklar:
 * - `Cage` — kafes (kod + tür + kapasite). Tenant-scoped.
 * - `Hospitalization` — yatış. Yaşam döngüsü: planned → admitted
 *   → active → discharged | cancelled.
 * - `CageAssignment` — bir yatışın hangi kafeste ne zaman
 *   kaldığını gösteren append-only aralık kaydı.
 *
 * Zaman çakışması kuralı: aynı `cageId` için açık
 * `CageAssignment.to = null` (devam eden) veya tarih aralıkları
 * çakışan iki kayıt olamaz. Yeni atamada aralık kontrolü yapılır.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

export const hospitalizationStatusSchema = z.enum([
  "planned",
  "admitted",
  "active",
  "discharged",
  "cancelled",
]);
export type HospitalizationStatus = z.infer<typeof hospitalizationStatusSchema>;

/** Kafes türü (türler arası çakışma kontrolü sonra eklenebilir). */
export const cageKindSchema = z.enum([
  "dog_small",
  "dog_medium",
  "dog_large",
  "cat",
  "exotic",
  "isolation",
  "icu",
  "recovery",
  "other",
]);
export type CageKind = z.infer<typeof cageKindSchema>;

/* --------------------------------------------------------------------------
 * Cage
 * --------------------------------------------------------------------------
 */

/**
 * Yeni kafes.
 * - `code` zorunlu (tenant-scoped unique; ör. "A1", "ICU-3").
 * - `name` opsiyonel (serbest; ör. "Köpek Küçük 1").
 * - `kind` zorunlu.
 * - `capacity` zorunlu (default 1; max 10).
 * - `active` opsiyonel (default true).
 */
export const cageCreateInputSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().max(200).optional(),
  kind: cageKindSchema,
  capacity: z.coerce.number().int().min(1).max(10).default(1),
  active: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional(),
});
export type CageCreateInput = z.infer<typeof cageCreateInputSchema>;

/** Kafes kısmi güncelleme. */
export const cageUpdateInputSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    kind: cageKindSchema.optional(),
    capacity: z.coerce.number().int().min(1).max(10).optional(),
    active: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type CageUpdateInput = z.infer<typeof cageUpdateInputSchema>;

/** Kafes response. */
export const cageSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string().nullable(),
  kind: cageKindSchema,
  capacity: z.number().int(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type Cage = z.infer<typeof cageSchema>;

/* --------------------------------------------------------------------------
 * Hospitalization
 * --------------------------------------------------------------------------
 */

/**
 * Yeni yatış.
 * - `patientId` zorunlu (Patient.id UUID).
 * - `plannedAt` opsiyonel (planlanan kabul zamanı).
 * - `reason` opsiyonel (serbest metin; ör. "post-op monitoring").
 * - `notes` opsiyonel.
 */
export const hospitalizationCreateInputSchema = z.object({
  patientId: z.string().uuid(),
  plannedAt: z.string().datetime().optional(),
  reason: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
export type HospitalizationCreateInput = z.infer<
  typeof hospitalizationCreateInputSchema
>;

/** Yatış kısmi güncelleme. */
export const hospitalizationUpdateInputSchema = z
  .object({
    plannedAt: z.string().datetime().nullable().optional(),
    reason: z.string().max(2000).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type HospitalizationUpdateInput = z.infer<
  typeof hospitalizationUpdateInputSchema
>;

/** Kabul (planned → admitted). */
export const hospitalizationAdmitInputSchema = z.object({
  admittedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type HospitalizationAdmitInput = z.infer<
  typeof hospitalizationAdmitInputSchema
>;

/** Taburcu (active → discharged). */
export const hospitalizationDischargeInputSchema = z.object({
  dischargedAt: z.string().datetime().optional(),
  reason: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
export type HospitalizationDischargeInput = z.infer<
  typeof hospitalizationDischargeInputSchema
>;

/** İptal (planned/admitted → cancelled). */
export const hospitalizationCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type HospitalizationCancelInput = z.infer<
  typeof hospitalizationCancelInputSchema
>;

/** Yatış response. */
export const hospitalizationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string().uuid(),
  status: hospitalizationStatusSchema,
  plannedAt: z.string().datetime().nullable(),
  admittedAt: z.string().datetime().nullable(),
  admittedBy: z.string().nullable(),
  dischargedAt: z.string().datetime().nullable(),
  dischargedBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type Hospitalization = z.infer<typeof hospitalizationSchema>;

/** Liste filtreleri. */
export const hospitalizationFiltersSchema = z.object({
  status: hospitalizationStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  activeOnly: z.coerce.boolean().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type HospitalizationFilters = z.infer<
  typeof hospitalizationFiltersSchema
>;

/** Liste response. */
export const hospitalizationListResponseSchema = z.object({
  items: z.array(hospitalizationSchema),
  total: z.number().int().nonnegative(),
});
export type HospitalizationListResponse = z.infer<
  typeof hospitalizationListResponseSchema
>;

/* --------------------------------------------------------------------------
 * CageAssignment
 * --------------------------------------------------------------------------
 */

/**
 * Yeni kafes atama.
 * - `cageId` zorunlu.
 * - `from` zorunlu (ISO datetime).
 * - `to` opsiyonel (null = devam eden atama).
 * - `notes` opsiyonel.
 */
export const cageAssignmentCreateInputSchema = z.object({
  cageId: z.string().min(1).max(100),
  from: z.string().datetime(),
  to: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CageAssignmentCreateInput = z.infer<
  typeof cageAssignmentCreateInputSchema
>;

/** Kafes ataması sonlandırma (to set et). */
export const cageAssignmentEndInputSchema = z.object({
  to: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});
export type CageAssignmentEndInput = z.infer<
  typeof cageAssignmentEndInputSchema
>;

/** Kafes ataması response. */
export const cageAssignmentSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  hospitalizationId: z.string(),
  cageId: z.string(),
  from: z.string().datetime(),
  to: z.string().datetime().nullable(),
  endedBy: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type CageAssignment = z.infer<typeof cageAssignmentSchema>;

/** Detay response — hospitalization + cage atamaları. */
export const hospitalizationDetailSchema = z.object({
  hospitalization: hospitalizationSchema,
  cageAssignments: z.array(cageAssignmentSchema),
});
export type HospitalizationDetail = z.infer<typeof hospitalizationDetailSchema>;

/** Cage filtreleri. */
export const cageFiltersSchema = z.object({
  kind: cageKindSchema.optional(),
  active: z.coerce.boolean().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type CageFilters = z.infer<typeof cageFiltersSchema>;

/** Cage liste response. */
export const cageListResponseSchema = z.object({
  items: z.array(cageSchema),
  total: z.number().int().nonnegative(),
});
export type CageListResponse = z.infer<typeof cageListResponseSchema>;
