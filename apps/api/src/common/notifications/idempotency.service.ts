/**
 * @file Bildirim idempotency servisi.
 * @module apps/api/common/notifications/idempotency.service
 *
 * @description Aynı `idempotencyKey` ile yapılan tekrar isteklerde
 * mevcut recordId'yi döner; provider tekrar çağrılmaz.
 * FAZ-0'da in-memory Map. Faz 11+ ile DB'ye (notification
 * tablosunda `idempotency_key` unique index) taşınır.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 * @updated Faz 11+ DB persist
 */

import { Injectable } from "@nestjs/common";

@Injectable()
export class IdempotencyService {
  private readonly store = new Map<string, string>();

  /**
   * Verilen anahtar daha önce işlendi mi? İşlendiyse ilişkili
   * recordId döner; aksi halde null.
   */
  public wasSent(idempotencyKey: string): { recordId: string } | null {
    const recordId = this.store.get(idempotencyKey);
    return recordId ? { recordId } : null;
  }

  /** Anahtar → recordId eşleştirmesini kaydeder. */
  public markSent(idempotencyKey: string, recordId: string): void {
    this.store.set(idempotencyKey, recordId);
  }

  /** Test yardımcısı. */
  public reset(): void {
    this.store.clear();
  }
}
