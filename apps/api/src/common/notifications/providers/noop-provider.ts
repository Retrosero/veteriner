/**
 * @file Noop notification provider.
 * @module apps/api/common/notifications/providers/noop
 *
 * @description Test/development için kullanılan no-op provider.
 * send() çağrısı başarılı sayılır ama hiçbir dış etkisi yoktur.
 * Provider seçim mantığını izole test etmek için idealdir.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 */

import { Injectable } from "@nestjs/common";

import type { NotificationChannel } from "@vetniva/contracts";

import type {
  NotificationProvider,
  ProviderSendPayload,
  ProviderSendResult,
} from "../provider.interface.js";

/**
 * Noop provider. Tüm kanallarda kullanılabilir (varsayılan
 * channel: `in_app`); her zaman başarılı döner.
 */
@Injectable()
export class NoopProvider implements NotificationProvider {
  public readonly channel: NotificationChannel = "in_app";

  public async send(_request: ProviderSendPayload): Promise<ProviderSendResult> {
    return { externalId: `noop-${Date.now()}`, status: "sent" };
  }
}
