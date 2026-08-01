/**
 * @file Stok uyarısı acknowledge state repository.
 * @module apps/api/modules/stock-alerts/stock-alert-acks.repository
 *
 * @description GOAL-067 (FAZ-6) düşük stok + SKT uyarıları için
 * acknowledge (görüldü) state'inin in-memory deposu. Uyarılar
 * her refresh'te yeniden hesaplanır (transient) ama ack'lar
 * korunur. Yalnızca acknowledged kayıtlar tutulur; resolve olan
 * ack'lar soft delete mantığıyla `revokedAt` alanına taşınır.
 *
 * İndeksler:
 * - `byTenantAndKey` — `tenantId|alertKey` → record (alertKey =
 *   `lowStock:productId` veya `expiring:lotId`).
 * - `byTenant`        — tenantId → Set<alertKey> (toplu listeleme).
 *
 * @security Tenant izolasyonu repo seviyesinde korunur:
 *   tüm sorgular `tenantId` ile başlar.
 *
 * @since GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları core
 */

import { Injectable } from "@nestjs/common";

import type { StockAlertAckRecord } from "../../common/stock-alerts/stock-alert.types.js";

@Injectable()
export class StockAlertAcksRepository {
  /**
   * key: `tenantId|alertKey` → record. Aynı tenant + alert için
   * tek kayıt; tekrar ack'lama idempotent (kayıt güncellenir).
   */
  private readonly byTenantAndKey = new Map<string, StockAlertAckRecord>();
  /** key: tenantId → Set<alertKey>. */
  private readonly byTenant = new Map<string, Set<string>>();

  /**
   * Yeni acknowledge state ekler (veya mevcut kaydı günceller).
   * Aynı tenant + alertKey için tekrar çağrıldığında `acknowledgedAt`
   * ve `acknowledgedBy` üzerine yazılır.
   */
  public upsert(record: StockAlertAckRecord): StockAlertAckRecord {
    const compositeKey = this.compositeKey(record.tenantId, record.alertKey);
    this.byTenantAndKey.set(compositeKey, record);

    let set = this.byTenant.get(record.tenantId);
    if (!set) {
      set = new Set<string>();
      this.byTenant.set(record.tenantId, set);
    }
    set.add(record.alertKey);
    return record;
  }

  /**
   * Belirli bir uyarı için ack kaydını döner. Bulunamazsa null.
   */
  public find(
    tenantId: string,
    alertType: "lowStock" | "expiring",
    targetId: string,
  ): StockAlertAckRecord | null {
    const key = this.compositeKey(tenantId, `${alertType}:${targetId}`);
    return this.byTenantAndKey.get(key) ?? null;
  }

  /**
   * Tenant-scoped tüm ack kayıtları. Compute sırasında uyarı
   * status'ünü zenginleştirmek için kullanılır.
   */
  public listForTenant(tenantId: string): StockAlertAckRecord[] {
    const set = this.byTenant.get(tenantId);
    if (!set || set.size === 0) return [];
    const out: StockAlertAckRecord[] = [];
    for (const alertKey of set.values()) {
      const rec = this.byTenantAndKey.get(
        this.compositeKey(tenantId, alertKey),
      );
      if (rec) out.push(rec);
    }
    return out;
  }

  /**
   * Tüm ack'ları temizle. `resetAcknowledgements=true` refresh
   * seçeneği ile kullanılır.
   */
  public clearForTenant(tenantId: string): number {
    const set = this.byTenant.get(tenantId);
    if (!set) return 0;
    const removed = set.size;
    for (const alertKey of set.values()) {
      this.byTenantAndKey.delete(this.compositeKey(tenantId, alertKey));
    }
    set.clear();
    return removed;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byTenantAndKey.clear();
    this.byTenant.clear();
  }

  private compositeKey(tenantId: string, alertKey: string): string {
    return `${tenantId}|${alertKey}`;
  }
}
