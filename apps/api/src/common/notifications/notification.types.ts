/**
 * @file Bildirim tip tanımları.
 * @module apps/api/common/notifications/notification.types
 *
 * @description SMS, e-posta, in-app ve WhatsApp kanalları üzerinden
 * gönderilecek bildirim istek ve kayıt tipleri. Zod şemaları
 * `@vetniva/contracts/notification` üzerinde; bu dosya runtime
 * tipleri taşır.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 */

import type {
  NotificationCategory,
  NotificationChannel,
  NotificationLocale,
  NotificationStatus,
} from "@vetniva/contracts";

/** Send isteğinin runtime karşılığı. */
export interface NotificationRequest {
  tenantId: string;
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  templateKey: string;
  locale: NotificationLocale;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}

/** Persist edilmiş bildirim kaydı. */
export interface NotificationRecord {
  id: string;
  tenantId: string;
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  templateKey: string;
  status: NotificationStatus;
  attempts: number;
  lastError?: string;
  sentAt?: string;
  createdAt: string;
}

/**
 * In-app inbox item. Sadece kullanıcıya gösterilecek in-app
 * bildirimleri tutar; inbox endpoint'i bu tipten döner.
 */
export interface InboxItem {
  id: string;
  category: NotificationCategory;
  templateKey: string;
  subject?: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/**
 * Provider sözleşmesinin taşıma yükü. Provider.send() bu yükü
 * alır, kendi kanalına göre dış servise iletir.
 */
export interface ProviderSendPayload {
  to: string;
  subject?: string;
  body: string;
  locale: NotificationLocale;
}

/**
 * Provider send sonucu. Dış servisin sağladığı ID (varsa) + durum.
 */
export interface ProviderSendResult {
  externalId: string;
  status: "sent" | "queued";
}
