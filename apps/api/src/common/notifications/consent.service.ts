/**
 * @file İletişim izni servisi.
 * @module apps/api/common/notifications/consent.service
 *
 * @description Kullanıcının kanal × kategori bazlı iletişim
 * iznini kontrol eder. FAZ-0'da in-memory Map; default davranış
 * "tüm kanallar izinli" şeklindedir. Faz 11+ ile
 * UserNotificationConsent tablosuna taşınır.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 * @updated Faz 11+ DB tabanlı consent
 */

import { Injectable } from "@nestjs/common";

import type {
  NotificationCategory,
  NotificationChannel,
} from "@vetniva/contracts";

/**
 * Consent anahtarı. Kanal + kategori kombinasyonu. Kullanıcı
 * bazında tutulur (tenant içi).
 */
export interface ConsentKey {
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
}

@Injectable()
export class ConsentService {
  /**
   * In-memory consent store. Key: `userId|channel|category`.
   * Değer `false` ise kullanıcı o kanal/kategori için opt-out
   * olmuş demektir. Map'te OLMAYAN key'ler default olarak
   * izinli sayılır.
   */
  private readonly denylist = new Map<string, true>();

  /**
   * Kullanıcının bu kanal/kategori kombinasyonunda
   * bildirim alıp alamayacağını kontrol eder.
   */
  public canSend(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
  ): boolean {
    const key = this.buildKey(userId, channel, category);
    return !this.denylist.has(key);
  }

  /**
   * Kullanıcının belirli bir kanal/kategori için opt-out
   * olmasını işaretler. KVKK/GDPR uyumu için gereklidir.
   */
  public optOut(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
  ): void {
    this.denylist.set(this.buildKey(userId, channel, category), true);
  }

  /** Test yardımcısı. */
  public reset(): void {
    this.denylist.clear();
  }

  private buildKey(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
  ): string {
    return `${userId}|${channel}|${category}`;
  }
}
