/**
 * @file İletimerkezi SMS provider stub.
 * @module apps/api/common/notifications/providers/iletimerkezi-sms
 *
 * @description Türkiye pazarı için İletimerkezi SMS sağlayıcısının
 * FAZ-0 stub'ı. Faz 13+ ile gerçek HTTP entegrasyonu gelecek.
 * Stub gelen isteği loglar ve queued status döner.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 * @updated Faz 13+ İletimerkezi HTTP entegrasyonu
 */

import { Injectable, Logger } from "@nestjs/common";

import type { NotificationChannel } from "@vetniva/contracts";

import type {
  NotificationProvider,
  ProviderSendPayload,
  ProviderSendResult,
} from "../provider.interface.js";

/**
 * İletimerkezi SMS provider. FAZ-0 stub. TR lokasyonlu tenant
 * için varsayılan SMS sağlayıcısı; prod'da API anahtarı + sender
 * header bilgisi env'den okunur.
 */
@Injectable()
export class IletimerkeziSmsProvider implements NotificationProvider {
  public readonly channel: NotificationChannel = "sms";
  private readonly logger = new Logger(IletimerkeziSmsProvider.name);

  public async send(request: ProviderSendPayload): Promise<ProviderSendResult> {
    // FAZ-0 stub: gerçek HTTP çağrısı yok. PII mask'lenmiş halde logla.
    this.logger.log({
      msg: "sms.stub.send",
      to_masked: maskPhone(request.to),
      body_length: request.body.length,
      locale: request.locale,
    });
    return { externalId: `stub-sms-${Date.now()}`, status: "queued" };
  }
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}
