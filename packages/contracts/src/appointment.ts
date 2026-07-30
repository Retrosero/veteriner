/**
 * @file Appointment (randevu) API sözleşmesi.
 * @module @vetniva/contracts/appointment
 *
 * @description GOAL-031 randevu oluşturma ve yönetim API sözleşmesi.
 * Zod şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
 */

import { z } from "zod";

/** Randevu türü. Klinik pilot kapsamı. */
export const appointmentTypeSchema = z.enum([
  "consultation",
  "vaccination",
  "surgery",
  "follow_up",
  "lab_visit",
  "grooming",
]);
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;

/** Randevu durumu. */
export const appointmentStatusSchema = z.enum([
  "scheduled",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/**
 * Yeni randevu oluşturma isteği.
 * - `start` gelecekte olmalı; `durationMin` 1..240 aralığında.
 * - Service katmanı patient + veterinarian aynı tenant'ta mı,
 *   slot uygun mu kontrollerini yapar.
 */
export const appointmentCreateInputSchema = z.object({
  patientId: z.string().min(1),
  veterinarianId: z.string().min(1),
  type: appointmentTypeSchema,
  /** ISO 8601 datetime (UTC). */
  start: z.string().datetime(),
  durationMin: z.number().int().min(1).max(240),
  notes: z.string().max(2000).optional(),
  /** Şube (multi-branch). Tenant-wide için atlanır. */
  branchId: z.string().optional(),
});
export type AppointmentCreateInput = z.infer<
  typeof appointmentCreateInputSchema
>;

/**
 * Randevu güncelleme isteği. Tüm alanlar opsiyonel; en az bir
 * alan verilmelidir (service katmanı enforce eder). start /
 * duration / veterinarian değişikliğinde çakışma kontrolü tekrar
 * yapılır.
 */
export const appointmentUpdateInputSchema = z
  .object({
    type: appointmentTypeSchema.optional(),
    start: z.string().datetime().optional(),
    durationMin: z.number().int().min(1).max(240).optional(),
    veterinarianId: z.string().min(1).optional(),
    status: appointmentStatusSchema.optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.type !== undefined ||
      v.start !== undefined ||
      v.durationMin !== undefined ||
      v.veterinarianId !== undefined ||
      v.status !== undefined ||
      v.notes !== undefined,
    { message: "En az bir alan güncellenmelidir" },
  );
export type AppointmentUpdateInput = z.infer<
  typeof appointmentUpdateInputSchema
>;

/** Randevu iptal isteği. */
export const appointmentCancelInputSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type AppointmentCancelInput = z.infer<
  typeof appointmentCancelInputSchema
>;

/** API response şeması. */
export const appointmentSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  ownerId: z.string(),
  veterinarianId: z.string(),
  type: appointmentTypeSchema,
  status: appointmentStatusSchema,
  /** ISO 8601 datetime. */
  start: z.string().datetime(),
  /** ISO 8601 datetime (start + durationMin). */
  end: z.string().datetime(),
  notes: z.string().nullable(),
  /** ISO 8601 datetime. */
  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

/** Liste filtreleri. */
export const appointmentFiltersSchema = z.object({
  patientId: z.string().optional(),
  veterinarianId: z.string().optional(),
  status: appointmentStatusSchema.optional(),
  /** ISO 8601 datetime (UTC). */
  from: z.string().datetime().optional(),
  /** ISO 8601 datetime (UTC). */
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type AppointmentFilters = z.infer<typeof appointmentFiltersSchema>;

/** Liste response şeması. */
export const appointmentListResponseSchema = z.object({
  items: z.array(appointmentSchema),
  total: z.number().int().nonnegative(),
});
export type AppointmentListResponse = z.infer<
  typeof appointmentListResponseSchema
>;
