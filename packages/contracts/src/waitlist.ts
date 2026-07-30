/**
 * @file Waitlist (bekleme listesi) API sözleşmesi.
 * @module @vetniva/contracts/waitlist
 *
 * @description GOAL-032 bekleme listesi ve resepsiyon akışı API
 * sözleşmesi. Zod şemaları + tipler. Backend (request/response
 * doğrulama) ve frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Bekleme listesi, hasta için uygun bir randevu slot'u
 * bulunamadığında oluşturulan bir "sıra kaydı"dır. Resepsiyon
 * akışı sırasında öncelik (priority) ve tercih edilen
 * tarih/veteriner bilgisi taşır; slot açıldığında
 * `convertToAppointment` ile randevuya dönüştürülür.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-032 (FAZ-3) bekleme listesi core
 */

import { z } from "zod";

/** Bekleme listesi kayıt durumu. */
export const waitlistStatusSchema = z.enum([
  "waiting",
  "notified",
  "scheduled",
  "cancelled",
  "expired",
]);
export type WaitlistStatus = z.infer<typeof waitlistStatusSchema>;

/** Bekleme listesi öncelik seviyesi. */
export const waitlistPrioritySchema = z.enum([
  "normal",
  "urgent",
  "emergency",
]);
export type WaitlistPriority = z.infer<typeof waitlistPrioritySchema>;

/**
 * Bekleme listesine yeni kayıt oluşturma isteği. `patientId`
 * zorunlu; `preferredDate` ve `preferredVeterinarianId` opsiyonel
 * (resepsiyon bunlardan en az birini sağlayabilir). `reason`
 * ve `priority` zorunlu.
 *
 * `expiresAt` isteğe bağlı override; verilmezse service varsayılan
 * olarak 30 gün sonrasına ayarlar.
 */
export const waitlistEntryCreateSchema = z.object({
  patientId: z.string().min(1),
  preferredDate: z.string().datetime().optional(),
  preferredVeterinarianId: z.string().min(1).optional(),
  reason: z.string().min(1).max(500),
  priority: waitlistPrioritySchema,
  expiresAt: z.string().datetime().optional(),
});
export type WaitlistEntryCreate = z.infer<typeof waitlistEntryCreateSchema>;

/** API response şeması. */
export const waitlistEntrySchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  ownerId: z.string(),
  status: waitlistStatusSchema,
  preferredDate: z.string().datetime().nullable(),
  preferredVeterinarianId: z.string().nullable(),
  reason: z.string(),
  priority: waitlistPrioritySchema,
  createdAt: z.string().datetime(),
  notifiedAt: z.string().datetime().nullable(),
  scheduledAppointmentId: z.string().nullable(),
  expiresAt: z.string().datetime(),
});
export type WaitlistEntry = z.infer<typeof waitlistEntrySchema>;

/** Liste filtreleri. */
export const waitlistFiltersSchema = z.object({
  status: waitlistStatusSchema.optional(),
  priority: waitlistPrioritySchema.optional(),
  patientId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type WaitlistFilters = z.infer<typeof waitlistFiltersSchema>;

/** Liste response şeması. */
export const waitlistListResponseSchema = z.object({
  items: z.array(waitlistEntrySchema),
  total: z.number().int().nonnegative(),
});
export type WaitlistListResponse = z.infer<typeof waitlistListResponseSchema>;
