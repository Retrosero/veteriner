/**
 * @file Follow-up (kontrol randevusu) API sözleşmesi.
 * @module @vetniva/contracts/followup
 *
 * @description GOAL-046 muayene veya reçeteden türetilen kontrol
 * randevusu oluşturma API sözleşmesi. Zod şemaları + tipler.
 * Backend (request/response doğrulama) ve frontend (form/typing)
 * aynı kaynaktan tüketir.
 *
 * Kontrol randevusu, normal bir `Appointment` (`type='follow_up'`)
 * olarak materialize edilir. Bu sözleşme yalnızca oluşturma
 * isteğinin şeklini tanımlar; response gövdesi `Appointment` ile
 * paylaşılır.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-046 (FAZ-4) kontrol randevusu core
 */

import { z } from "zod";

/**
 * Muayeneden kontrol randevusu oluşturma isteği.
 * - `followUpDate` gelecekte olmalı (geçmiş → 422 VET-VALIDATION-0009).
 * - `veterinarianId` opsiyonel; verilmezse muayeneden türetilir.
 * - `notes` opsiyonel; appointment.notes'a yazılır.
 */
export const followUpFromExaminationInputSchema = z.object({
  /** ISO 8601 datetime (gelecekte). */
  followUpDate: z.string().datetime(),
  /** Opsiyonel; muayenedeki veteriner yerine başka birine atanabilir. */
  veterinarianId: z.string().min(1).optional(),
  /** Opsiyonel serbest not (randevu notuna eklenir). */
  notes: z.string().max(2000).optional(),
});
export type FollowUpFromExaminationInput = z.infer<
  typeof followUpFromExaminationInputSchema
>;

/**
 * Reçeteden kontrol randevusu oluşturma isteği.
 * - `followUpDate` gelecekte olmalı (geçmiş → 422 VET-VALIDATION-0009).
 * - `veterinarianId` reçeteden türetilir (override yoktur).
 * - `notes` opsiyonel.
 */
export const followUpFromPrescriptionInputSchema = z.object({
  /** ISO 8601 datetime (gelecekte). */
  followUpDate: z.string().datetime(),
  /** Opsiyonel serbest not (randevu notuna eklenir). */
  notes: z.string().max(2000).optional(),
});
export type FollowUpFromPrescriptionInput = z.infer<
  typeof followUpFromPrescriptionInputSchema
>;
