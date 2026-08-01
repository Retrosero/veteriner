/**
 * @file In-process notification queue.
 * @module apps/api/common/notifications/queue
 * @description FAZ-0 için basit in-process queue. Provider.send()
 * çağrısını queue'ya alır, `processAll()` ile sırayla dispatch
 * eder. Hata durumunda 3 deneme + exponential backoff yapar.
 *
 * Faz 11+ ile BullMQ (worker) tabanlı gerçek queue'ya geçer; bu
 * servis interface olarak korunur, implementasyon değişir.
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 * @updated Faz 11+ BullMQ implementasyonu
 */

import { Injectable, Logger } from "@nestjs/common";

import type {
  NotificationProvider,
  ProviderSendPayload,
} from "./provider.interface.js";
import type { NotificationChannel } from "@vetniva/contracts";

/** Queue'ya alınan tek bir iş. */
export interface QueueItem {
  recordId: string;
  channel: NotificationChannel;
  payload: ProviderSendPayload;
  attempts: number;
  /** Retry simülasyonu için sonraki deneme zamanı (ms). */
  nextAttemptAt: number;
}

export const MAX_ATTEMPTS = 3;
/** Exponential backoff: 50ms, 150ms, 450ms. */
const BACKOFF_BASE_MS = 50;
const BACKOFF_FACTOR = 3;

/**
 * Queue item sonucu. `processAll()` çağırıcısı her item için
 * sonucu alır; başarılıysa record'u "sent" işaretler, aksi
 * halde "failed" veya retry planlar.
 */
export interface QueueProcessOutcome {
  recordId: string;
  status: "sent" | "failed" | "retrying";
  externalId?: string;
  error?: string;
  attempts: number;
}

@Injectable()
export class NotificationQueue {
  private readonly logger = new Logger(NotificationQueue.name);
  private readonly items: QueueItem[] = [];

  public constructor(private readonly providers: NotificationProvider[]) {}

  /** Provider listesi (kanal adına göre erişim). */
  public getProviders(): ReadonlyArray<NotificationProvider> {
    return this.providers;
  }

  /**
   * Kanal adına göre provider'ı bulur. Bulunamazsa hata.
   * Birden fazla provider aynı kanalda ise ilki seçilir.
   * @param channel
   */
  public resolveProvider(channel: NotificationChannel): NotificationProvider {
    const provider = this.providers.find((p) => p.channel === channel);
    if (!provider) {
      throw new Error(`Bu kanal için provider kayıtlı değil: ${channel}`);
    }
    return provider;
  }

  /**
   * Queue'ya yeni bir iş ekler.
   * @param item
   */
  public enqueue(item: Omit<QueueItem, "attempts" | "nextAttemptAt">): void {
    this.items.push({
      ...item,
      attempts: 0,
      nextAttemptAt: Date.now(),
    });
  }

  /** Kuyruktaki bekleyen iş sayısı. Test/diagnostic için. */
  public size(): number {
    return this.items.length;
  }

  /**
   * Tüm kuyruğu işler. `now` parametresi test için enjekte
   * edilebilir (backoff simülasyonu). Retry'lar kuyruğa geri
   * eklenir.
   * @param now
   */
  public async processAll(
    now: number = Date.now(),
  ): Promise<QueueProcessOutcome[]> {
    const outcomes: QueueProcessOutcome[] = [];
    const remaining: QueueItem[] = [];

    // Snapshot — processOne mutasyon yapmaz, retry'lar burada
    // yönetilir. Snapshot for...of sırasında splice edilmiş
    // item'ların ikinci kez ziyaret edilmesini engeller.
    const snapshot = this.items.slice();
    this.items.length = 0;

    for (const item of snapshot) {
      if (item.nextAttemptAt > now) {
        remaining.push(item);
        continue;
      }
      const outcome = await this.processOne(item);
      outcomes.push(outcome);
      if (outcome.status === "retrying") {
        const backoff =
          BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, outcome.attempts - 1);
        remaining.push({
          ...item,
          attempts: outcome.attempts,
          nextAttemptAt: now + backoff,
        });
      }
    }

    this.items.push(...remaining);
    return outcomes;
  }

  /**
   * Tek bir item'ı işler. Provider'ı çağırır; hata olursa
   * outcome döner (retry planlaması processAll'a bırakılır).
   * `now` test deterministikliği için opsiyonel.
   * @param item
   */
  private async processOne(item: QueueItem): Promise<QueueProcessOutcome> {
    const nextAttempts = item.attempts + 1;
    try {
      const provider = this.resolveProvider(item.channel);
      const result = await provider.send(item.payload);
      return {
        recordId: item.recordId,
        status: "sent",
        externalId: result.externalId,
        attempts: nextAttempts,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (nextAttempts >= MAX_ATTEMPTS) {
        this.logger.warn({
          msg: "notification.queue.failed",
          recordId: item.recordId,
          channel: item.channel,
          attempts: nextAttempts,
          error: message,
        });
        return {
          recordId: item.recordId,
          status: "failed",
          error: message,
          attempts: nextAttempts,
        };
      }
      return {
        recordId: item.recordId,
        status: "retrying",
        error: message,
        attempts: nextAttempts,
      };
    }
  }
}
