/**
 * @file In-app bildirim provider.
 * @module apps/api/common/notifications/providers/in-app
 * @description In-app kanal bildirimleri her zaman başarılıdır;
 * mesaj kullanıcının inbox'ına yazılır (in-memory store, FAZ-0).
 * Faz 13+'da inbox DB'ye (Notification tablosu) persist edilir.
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 * @updated Faz 13+ DB persist
 */

import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { InboxItem } from "../notification.types.js";
import type {
  NotificationProvider,
  ProviderSendPayload,
  ProviderSendResult,
} from "../provider.interface.js";
import type { NotificationChannel } from "@vetniva/contracts";

/**
 * In-memory inbox store. FAZ-0: in-process Map. Faz 13+'da
 * Notification tablosuna taşınır. Test'lerde resetlenebilir.
 */
@Injectable()
export class InboxStore {
  private readonly byUser = new Map<string, InboxItem[]>();

  public add(userId: string, item: InboxItem): void {
    const list = this.byUser.get(userId) ?? [];
    list.push(item);
    this.byUser.set(userId, list);
  }

  public list(userId: string): InboxItem[] {
    return [...(this.byUser.get(userId) ?? [])];
  }

  /** Test yardımcısı: tüm in-memory state'i temizler. */
  public reset(): void {
    this.byUser.clear();
  }
}

/**
 * In-app provider. Tüm in-app bildirimleri InboxStore'a yazar
 * ve sent status döner. Dış servise bağımlılığı yoktur.
 */
@Injectable()
export class InAppProvider implements NotificationProvider {
  public readonly channel: NotificationChannel = "in_app";

  public constructor(private readonly store: InboxStore) {}

  public async send(
    request: ProviderSendPayload & {
      userId: string;
      category: string;
      templateKey: string;
    },
  ): Promise<ProviderSendResult> {
    const item: InboxItem = {
      id: randomUUID(),
      category: request.category as InboxItem["category"],
      templateKey: request.templateKey,
      ...(request.subject !== undefined ? { subject: request.subject } : {}),
      body: request.body,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    this.store.add(request.userId, item);
    return { externalId: item.id, status: "sent" };
  }
}
