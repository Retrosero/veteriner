/**
 * @file Appointment (randevu) domain tipleri.
 * @module apps/api/modules/appointments/appointments.types
 *
 * @description GOAL-031 randevu domain modeli. Randevu bir
 * (tenant, patient, veterinarian, start) dörtlüsünün rezervasyonu
 * olup, calendar'ın booked slot'una bağlanır. In-memory Map'te
 * tutulur; production'a geçişte Prisma `Appointment` tablosu ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Randevu bilgileri identity düzeyindedir (vet → patient → zaman);
 * klinik kayıt (muayene, aşı vb.) append-only / versiyonlanır ve
 * appointment'a foreign key ile bağlanır (FAZ-3 ileriki goal'lar).
 *
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
 */

import type {
  Appointment,
  AppointmentCreateInput,
  AppointmentFilters,
  AppointmentStatus,
  AppointmentType,
  AppointmentUpdateInput,
} from "@vetniva/contracts";

export type {
  Appointment,
  AppointmentCreateInput,
  AppointmentFilters,
  AppointmentStatus,
  AppointmentType,
  AppointmentUpdateInput,
};

/** Randevu tipi için izin verilen minimum süre (dakika). */
export const APPOINTMENT_MIN_DURATION_MIN = 1;

/** Randevu tipi için izin verilen maksimum süre (dakika). */
export const APPOINTMENT_MAX_DURATION_MIN = 240;
