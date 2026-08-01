/**
 * @file Vaccine reminder (aşı hatırlatma) API sözleşmesi.
 * @module @vetniva/contracts/vaccine-reminder
 *
 * @description GOAL-053 aşı hatırlatma iş kurallarının API
 * sözleşmesi. FAZ-0'da DB yok; in-memory Map'te tutulan
 * `VaccineReminderRecord`'ların listelenmesi ve zamanı gelen
 * hatırlatıcıların tetiklenmesi için Zod şemaları + tipler.
 *
 * İş kuralları (service katmanında enforce edilir):
 * - `scheduleForApplication`: aşı uygulaması oluşturulunca
 *   `nextDueDate` veya `step.boosterIntervalDays`'ten
 *   hesaplanan tarih için tenant default config ile
 *   hatırlatma planlanır. Geleceğe dair tarih değilse
 *   skip. Aynı (applicationId+channel+scheduledFor) idempotent.
 *   Owner marketing consent yoksa sms/email atlanır; in_app'e
 *   düşer.
 * - `cancelForApplication`: uygulama iptal edilince
 *   `status='scheduled'` olan hatırlatmalar cancel olur.
 * - `cancelForPatient`: hasta silindiğinde (soft) tüm planlı
 *   hatırlatmalar cancel olur.
 * - `rescheduleForApplication`: `nextDueDate` amend edildiğinde
 *   delta ile scheduledFor kaydırılır; yeni zaman geçmişte ise
 *   `cancelled` yapılır.
 * - `processDueReminders`: now >= scheduledFor && status='scheduled'
 *   olanlar işlenir. NotificationService.send başarılı → sent;
 *   failed → error set. SYSTEM audit.
 *
 * @security Sözleşme PII içermez.
 * @since GOAL-053 (FAZ-5) aşı hatırlatma core
 */

import { z } from "zod";

import {
  reminderChannelSchema,
  reminderStatusSchema,
} from "./appointment-reminder.js";

/** Aşı hatırlatma kanalı. Randevu hatırlatmadaki ile aynı sözleşme. */
export const vaccineReminderChannelSchema = reminderChannelSchema;
export type VaccineReminderChannel = z.infer<
  typeof vaccineReminderChannelSchema
>;

/** Aşı hatırlatma kaydı durumları. */
export const vaccineReminderStatusSchema = reminderStatusSchema;
export type VaccineReminderStatus = z.infer<typeof vaccineReminderStatusSchema>;

/**
 * Tenant başına aşı hatırlatma config input (opsiyonel). Verilmezse
 * service default config kullanır: `nextDueDate` (uygulama üzerinden)
 * için 7 gün önce + `step.boosterIntervalDays` hesabı; default
 * kanallar sms + in_app.
 */
export const vaccineReminderConfigInputSchema = z
  .object({
    /**
     * Sonraki aşı tarihinden kaç gün önce hatırlatma gönderileceği.
     * Default: 7 (yani due'dan 7 gün önce). Min 1, max 90.
     */
    daysBeforeDue: z.number().int().min(1).max(90),
    /**
     * Tenant için aktif kanallar. `enabled=false` olan kanallar
     * atlanır; listede yoksa default kanallar kullanılır.
     */
    channels: z
      .array(
        z.object({
          channel: vaccineReminderChannelSchema,
          enabled: z.boolean(),
        }),
      )
      .min(1)
      .max(3),
  })
  .optional();
export type VaccineReminderConfigInput = z.infer<
  typeof vaccineReminderConfigInputSchema
>;

/**
 * Aşı hatırlatma listeleme filtresi.
 * - `patientId` opsiyonel (controller'dan :patientId taşınır).
 * - `protocolId` opsiyonel.
 * - `applicationId` opsiyonel.
 * - `status` opsiyonel filtre.
 */
export const vaccineReminderListQuerySchema = z.object({
  protocolId: z.string().optional(),
  applicationId: z.string().optional(),
  status: vaccineReminderStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type VaccineReminderListQuery = z.infer<
  typeof vaccineReminderListQuerySchema
>;

/**
 * API response şeması. `applicationSnapshot` ve `stepSnapshot`
 * yalnızca service-internal context için; API response'ta
 * paylaşılmaz.
 */
export const vaccineReminderSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  applicationId: z.string(),
  patientId: z.string(),
  protocolId: z.string(),
  channel: vaccineReminderChannelSchema,
  scheduledFor: z.string().datetime(),
  nextDueDate: z.string(),
  status: vaccineReminderStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type VaccineReminder = z.infer<typeof vaccineReminderSchema>;

/** Tüm aşı hatırlatma şemaları için ortak export. */
export const vaccineReminderSchemas = {
  channel: vaccineReminderChannelSchema,
  status: vaccineReminderStatusSchema,
  configInput: vaccineReminderConfigInputSchema,
  listQuery: vaccineReminderListQuerySchema,
  reminder: vaccineReminderSchema,
} as const;
