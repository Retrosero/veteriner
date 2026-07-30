/**
 * @file Bildirim modülü.
 * @module apps/api/modules/notifications/notifications.module
 *
 * @description Provider'ları + core servisleri DI kabına bağlar.
 * AuditModule global; burada yalnızca kendi provider/service
 * kayıtları yapılır.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 */

import { Module } from "@nestjs/common";

import { AuditModule } from "../../common/audit/audit.module.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import { IdempotencyService } from "../../common/notifications/idempotency.service.js";
import { NotificationQueue } from "../../common/notifications/queue.js";
import { TemplateService } from "../../common/notifications/template.service.js";
import { IletimerkeziSmsProvider } from "../../common/notifications/providers/iletimerkezi-sms.provider.js";
import { InAppProvider, InboxStore } from "../../common/notifications/providers/in-app.provider.js";
import { NoopProvider } from "../../common/notifications/providers/noop-provider.js";
import { SmtpEmailProvider } from "../../common/notifications/providers/smtp-email.provider.js";
import type { NotificationProvider } from "../../common/notifications/provider.interface.js";

import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

/**
 * FAZ-0 provider seti. Faz 13+'da prod provider'lar env-driven
 * olarak değiştirilebilir (örn. tenant.country === "GB" ise
 * Twilio SMS).
 */
const providers: NotificationProvider[] = [
  new SmtpEmailProvider(),
  new IletimerkeziSmsProvider(),
  new InAppProvider(new InboxStore()),
  new NoopProvider(),
];

@Module({
  imports: [AuditModule],
  controllers: [NotificationsController],
  providers: [
    TemplateService,
    ConsentService,
    IdempotencyService,
    InboxStore,
    NotificationsService,
    {
      provide: NotificationQueue,
      useFactory: () => new NotificationQueue(providers),
    },
    // Provider'lar doğrudan DI'ya eklenmiyor — queue factory
    // üzerinden geçiyor. InApp provider'ın InboxStore'a
    // bağımlılığı kendi constructor'ında çözümleniyor.
  ],
  exports: [NotificationsService, NotificationQueue],
})
export class NotificationsModule {}
