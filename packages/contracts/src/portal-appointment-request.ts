/**
 * @file Portal randevu talebi (appointment request) API sözleşmesi.
 * @module @vetniva/contracts/portal-appointment-request
 *
 * @description GOAL-035 hasta sahibi portal — online randevu talebi
 * oluşturma, listeleme, iptal, onay ve reddetme işlemleri için Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve frontend
 * (form/typing) aynı kaynaktan tüketir.
 *
 * @security Sözleşme PII içermez; yalnızca alan isimleri/tipleri.
 *   preferredDate ISO 8601 datetime; service katmanı gelecek tarih
 *   kontrolü yapar (geçmiş → 422 VET-VALIDATION-0009).
 *
 * @since GOAL-035 (FAZ-3) online randevu talebi core
 */

import { z } from "zod";

import { appointmentTypeSchema } from "./appointment.js";

/** Talep durumu yaşam döngüsü:
 *  - pending      : portal sahibi oluşturdu, personel kararı bekleniyor
 *  - approved     : personel onayladı → otomatik Appointment oluşturuldu
 *  - rejected     : personel reddetti (rejectionReason ile)
 *  - cancelled    : portal sahibi iptal etti
 *  - auto_scheduled : FAZ-3+ için ayrılmış, henüz kullanılmıyor
 */
export const appointmentRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "auto_scheduled",
]);
export type AppointmentRequestStatus = z.infer<
  typeof appointmentRequestStatusSchema
>;

/** İletişim tercihi. */
export const contactPreferenceSchema = z.enum(["phone", "email", "sms"]);
export type ContactPreference = z.infer<typeof contactPreferenceSchema>;

/**
 * Yeni randevu talebi oluşturma isteği (portal → backend).
 * `patientId` zorunlu; tercih edilen veteriner opsiyonel.
 */
export const appointmentRequestCreateInputSchema = z.object({
  patientId: z.string().min(1),
  /** ISO 8601 datetime (gelecekte olmalı; service kontrol eder). */
  preferredDate: z.string().datetime(),
  preferredVeterinarianId: z.string().min(1).optional(),
  type: appointmentTypeSchema,
  reason: z.string().min(1).max(2000),
  contactPreference: contactPreferenceSchema,
});
export type AppointmentRequestCreateInput = z.infer<
  typeof appointmentRequestCreateInputSchema
>;

/** Personel reddetme isteği. */
export const appointmentRequestRejectInputSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type AppointmentRequestRejectInput = z.infer<
  typeof appointmentRequestRejectInputSchema
>;

/** API response: randevu talebi. */
export const appointmentRequestSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  ownerId: z.string(),
  status: appointmentRequestStatusSchema,
  preferredDate: z.string().datetime(),
  preferredVeterinarianId: z.string().nullable(),
  type: appointmentTypeSchema,
  reason: z.string(),
  contactPreference: contactPreferenceSchema,
  requestedAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  decidedBy: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  /** Approve edildiğinde oluşturulan Appointment ID (varsa). */
  approvedAppointmentId: z.string().nullable(),
});
export type AppointmentRequest = z.infer<typeof appointmentRequestSchema>;

/** Liste response. */
export const appointmentRequestListResponseSchema = z.object({
  items: z.array(appointmentRequestSchema),
  total: z.number().int().nonnegative(),
});
export type AppointmentRequestListResponse = z.infer<
  typeof appointmentRequestListResponseSchema
>;

/** Tüm portal-appointment-request şemaları için ortak export. */
export const portalAppointmentRequestSchemas = {
  status: appointmentRequestStatusSchema,
  contactPreference: contactPreferenceSchema,
  createInput: appointmentRequestCreateInputSchema,
  rejectInput: appointmentRequestRejectInputSchema,
  request: appointmentRequestSchema,
  listResponse: appointmentRequestListResponseSchema,
} as const;
