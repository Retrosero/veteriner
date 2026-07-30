/**
 * @file Notification provider sözleşmesi.
 * @module apps/api/common/notifications/provider.interface
 *
 * @description Tüm dış sağlayıcılar (SMTP, SMS, WhatsApp, in-app)
 * için ortak arayüz. Her provider belirli bir kanalda çalışır ve
 * DI ile container'a eklenir. NotificationsService provider'ı
 * kanal adına göre seçer.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 */

import type { NotificationChannel, NotificationLocale } from "@vetniva/contracts";

/** Provider'a gönderilen yük. */
export interface ProviderSendPayload {
  to: string;
  subject?: string;
  body: string;
  locale: NotificationLocale;
}

/** Provider'ın döndüğü sonuç. */
export interface ProviderSendResult {
  externalId: string;
  status: "sent" | "queued";
}

/**
 * Notification provider sözleşmesi. Her provider belirli bir
 * kanalda çalışır; kanal adı `channel` alanında belirtilir.
 */
export interface NotificationProvider {
  /** Bu provider'ın hizmet verdiği kanal. */
  readonly channel: NotificationChannel;
  /**
   * Tek bir bildirimi dış servise gönderir. Hata durumunda
   * exception fırlatır; queue bu hatayı yakalayıp retry yapar.
   */
  send(request: ProviderSendPayload): Promise<ProviderSendResult>;
}
