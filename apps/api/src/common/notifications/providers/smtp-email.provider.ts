/**
 * @file SMTP e-posta provider stub.
 * @module apps/api/common/notifications/providers/smtp-email
 *
 * @description Nodemailer tabanlı SMTP gönderiminin FAZ-0 stub'ı.
 * Gerçek implementasyon Faz 13+ (prod-ready entegrasyon) ile
 * gelecek. Stub her zaman başarısız olur; FAZ-0'da testler bu
 * provider'ı kullanmaz (in-app/noop kullanır).
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 * @updated Faz 13+ nodemailer implementasyonu
 */

import { Injectable, Logger } from "@nestjs/common";

import type { NotificationChannel } from "@vetniva/contracts";

import type {
  NotificationProvider,
  ProviderSendPayload,
  ProviderSendResult,
} from "../provider.interface.js";

/**
 * SMTP e-posta provider. FAZ-0'da stub: gönderimi simüle eder
 * ama dış servise bağlanmaz. Prod'da nodemailer ile gerçek SMTP
 * (veya SendGrid/Amazon SES) üzerinden gönderir.
 */
@Injectable()
export class SmtpEmailProvider implements NotificationProvider {
  public readonly channel: NotificationChannel = "email";
  private readonly logger = new Logger(SmtpEmailProvider.name);

  public async send(_request: ProviderSendPayload): Promise<ProviderSendResult> {
    // FAZ-0: stub. Gerçek gönderim Faz 13+'da nodemailer ile.
    this.logger.warn(
      "SmtpEmailProvider FAZ-0 stub: gerçek SMTP gönderimi devre dışı",
    );
    return { externalId: `stub-email-${Date.now()}`, status: "queued" };
  }
}
