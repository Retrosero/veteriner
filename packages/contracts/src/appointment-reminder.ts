/**
 * @file Appointment reminder (randevu hatırlatma) API sözleşmesi.
 * @module @vetniva/contracts/appointment-reminder
 *
 * @description GOAL-036 randevu hatırlatma iş kurallarının API
 * sözleşmesi. FAZ-0'da DB yok; in-memory Map'te tutulan
 * `ReminderRecord`'ların listelenmesi ve zamanı gelen hatırlatıcıların
 * tetiklenmesi için Zod şemaları + tipler.
 *
 * İş kuralları (service katmanında enforce edilir):
 * - `scheduleForAppointment`: tenant config default (24 saat önce +
 *   sms + in_app). `scheduledFor` gelecekte olmalı; geçmiş ise skip.
 * - `cancelForAppointment`: appointment iptal edilince
 *   `status='scheduled'` olan hatırlatıcılar cancel olur.
 * - `processDueReminders`: now >= scheduledFor && status='scheduled'
 *   olanlar işlenir. NotificationService.send başarılı → sent;
 *   failed → error set. SYSTEM audit.
 *
 * @security Sözleşme PII içermez.
 * @since GOAL-036 (FAZ-3) randevu hatırlatma core
 */

import { z } from "zod";

/** Hatırlatma kanalı. */
export const reminderChannelSchema = z.enum(["sms", "email", "in_app"]);
export type ReminderChannel = z.infer<typeof reminderChannelSchema>;

/** Hatırlatma kaydı durumları. */
export const reminderStatusSchema = z.enum([
  "scheduled",
  "sent",
  "failed",
  "cancelled",
]);
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;

/**
 * Tenant başına hatırlatma config input (opsiyonel). Verilmezse
 * service default config kullanır: 24 saat önce, sms + in_app.
 */
export const reminderConfigInputSchema = z
  .object({
    appointmentType: z.string().min(1).max(50).optional(),
    hoursBeforeAppointment: z.number().int().min(1).max(168),
    channels: z
      .array(
        z.object({
          channel: reminderChannelSchema,
          enabled: z.boolean(),
        }),
      )
      .min(1)
      .max(3),
  })
  .optional();
export type ReminderConfigInput = z.infer<typeof reminderConfigInputSchema>;

/**
 * Hatırlatma listeleme filtresi.
 * - `appointmentId` opsiyonel (controller'dan :id taşınır).
 * - `status` opsiyonel filtre.
 */
export const reminderListQuerySchema = z.object({
  status: reminderStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ReminderListQuery = z.infer<typeof reminderListQuerySchema>;

/** Tüm reminder şemaları için ortak export. */
export const reminderSchemas = {
  channel: reminderChannelSchema,
  status: reminderStatusSchema,
  configInput: reminderConfigInputSchema,
  listQuery: reminderListQuerySchema,
} as const;
