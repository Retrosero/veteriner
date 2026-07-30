/**
 * @file Calendar (klinik takvimi) API sözleşmesi.
 * @module @vetniva/contracts/calendar
 *
 * @description GOAL-030 klinik takvimi için API sözleşmesi. Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-030 (FAZ-3) klinik takvimi core
 */

import { z } from "zod";

/** Slot durumu. */
export const calendarSlotStatusSchema = z.enum([
  /** Uygun; appointment atanabilir. */
  "available",
  /** Dolu; mevcut bir appointment bu slot'a bağlı. */
  "booked",
  /** Engellenmiş; mola/izin/tatil. */
  "blocked",
]);
export type CalendarSlotStatus = z.infer<typeof calendarSlotStatusSchema>;

/** Haftanın günü. 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi. */
export const dayOfWeekSchema = z
  .number()
  .int()
  .min(0)
  .max(6);
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Saat formatı (HH:mm, 24 saat). */
export const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçersiz saat formatı (HH:mm)");

/** Veterinarian için çalışma saati tanımı. */
export const workingHoursSchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  startTime: hhmmSchema,
  endTime: hhmmSchema,
  slotDurationMin: z.number().int().min(5).max(240),
});
export type WorkingHours = z.infer<typeof workingHoursSchema>;

/** Tek bir slot tanımı. */
export const calendarSlotSchema = z.object({
  /** ISO 8601 datetime. */
  start: z.string().datetime(),
  /** ISO 8601 datetime. */
  end: z.string().datetime(),
  status: calendarSlotStatusSchema,
  /** Booked ise bağlı appointment ID. */
  appointmentId: z.string().optional(),
  veterinarianId: z.string(),
});
export type CalendarSlot = z.infer<typeof calendarSlotSchema>;

/** Bir günün tam takvim görünümü. */
export const calendarDaySchema = z.object({
  /** YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih (YYYY-MM-DD)"),
  slots: z.array(calendarSlotSchema),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

/** Çalışma saati güncelleme isteği (PUT body). */
export const setWorkingHoursInputSchema = z.object({
  /** Belirtilirse yalnızca bu veterinarian için; tenant default'u
   *  güncellenmek istenirse atlanır. */
  veterinarianId: z.string().optional(),
  hours: z.array(workingHoursSchema).min(1).max(7),
});
export type SetWorkingHoursInput = z.infer<typeof setWorkingHoursInputSchema>;

/** Slot bloklama isteği (POST body). */
export const blockSlotInputSchema = z.object({
  veterinarianId: z.string(),
  /** Belirtilirse yalnızca bu şubede bloklanır. NULL/atlanırsa
   *  tenant-wide blok olarak işlenir (tüm şubelerde görünür). */
  branchId: z.string().optional(),
  /** ISO 8601 datetime. */
  start: z.string().datetime(),
  /** ISO 8601 datetime. */
  end: z.string().datetime(),
  reason: z.string().min(1).max(200),
});
export type BlockSlotInput = z.infer<typeof blockSlotInputSchema>;

/** Gün sorgu parametreleri (GET). */
export const getDayQuerySchema = z.object({
  /** Belirtilirse yalnızca bu veterinarian'ın slot'ları. */
  veterinarianId: z.string().optional(),
  /** Belirtilirse yalnızca bu şubenin takvimi döner. Boş bırakılırsa
   *  tenant altındaki tüm şubelerin slot'ları birleşik döner. */
  branchId: z.string().optional(),
});
export type GetDayQuery = z.infer<typeof getDayQuerySchema>;

/** Gün endpoint path parametresi. */
export const getDayParamsSchema = z.object({
  /** YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih (YYYY-MM-DD)"),
});
export type GetDayParams = z.infer<typeof getDayParamsSchema>;

/** Block endpoint path parametresi. */
export const unblockSlotParamsSchema = z.object({
  id: z.string().min(1),
});
export type UnblockSlotParams = z.infer<typeof unblockSlotParamsSchema>;

/** Engellenen slot'un response şeması. */
export const blockedSlotResponseSchema = z.object({
  id: z.string(),
  veterinarianId: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  reason: z.string(),
  createdAt: z.string().datetime(),
});
export type BlockedSlotResponse = z.infer<typeof blockedSlotResponseSchema>;
