/**
 * @file Bildirim sözleşmesi.
 * @module @vetniva/contracts/notification
 *
 * @description SMS / e-posta / in-app / WhatsApp kanalları üzerinden
 * gönderilecek bildirim istek ve kayıt şemaları. Hem backend (request
 * doğrulama) hem frontend (form/typing) tarafından tüketilir.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 */

import { z } from "zod";

/** Desteklenen bildirim kanalları. */
export const notificationChannelSchema = z.enum([
  "sms",
  "email",
  "in_app",
  "whatsapp",
]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** Bildirim kaydı durumları. */
export const notificationStatusSchema = z.enum([
  "queued",
  "sending",
  "sent",
  "failed",
  "bounced",
  "opted_out",
]);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

/** Bildirim kategorileri (template seçimi + consent kuralları için). */
export const notificationCategorySchema = z.enum([
  "appointment_reminder",
  "vaccination_due",
  "lab_result_ready",
  "invoice",
  "portal_invite",
  "custom",
]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

/** Tenant dili. */
export const notificationLocaleSchema = z.enum(["tr-TR", "en-GB"]);
export type NotificationLocale = z.infer<typeof notificationLocaleSchema>;

/**
 * Bildirim isteği. Service.send() metoduna geçilen yük.
 * `idempotencyKey` verilirse aynı anahtar ile ikinci istek no-op sayılır
 * ve mevcut recordId döner.
 */
export const notificationRequestSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  channel: notificationChannelSchema,
  category: notificationCategorySchema,
  templateKey: z.string().min(1).max(100),
  locale: notificationLocaleSchema,
  data: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type NotificationRequest = z.infer<typeof notificationRequestSchema>;

/**
 * Inbox item (in-app bildirim listesi için). NotificationRecord'un
 * kullanıcıya gösterilen alt kümesi.
 */
export const inboxItemSchema = z.object({
  id: z.string().uuid(),
  category: notificationCategorySchema,
  templateKey: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

/**
 * Inbox response. Kullanıcının okunmamış + son okunmuş in-app
 * bildirimleri.
 */
export const inboxResponseSchema = z.object({
  items: z.array(inboxItemSchema),
});
export type InboxResponse = z.infer<typeof inboxResponseSchema>;

/**
 * Notification send response. Tek bir bildirim kaydı + durum.
 */
export const notificationRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  channel: notificationChannelSchema,
  category: notificationCategorySchema,
  templateKey: z.string(),
  status: notificationStatusSchema,
  attempts: z.number().int().min(0),
  lastError: z.string().optional(),
  sentAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type NotificationRecord = z.infer<typeof notificationRecordSchema>;

/** Tüm notification şemaları için ortak export. */
export const notificationSchemas = {
  channel: notificationChannelSchema,
  status: notificationStatusSchema,
  category: notificationCategorySchema,
  locale: notificationLocaleSchema,
  request: notificationRequestSchema,
  record: notificationRecordSchema,
  inboxItem: inboxItemSchema,
  inboxResponse: inboxResponseSchema,
} as const;
