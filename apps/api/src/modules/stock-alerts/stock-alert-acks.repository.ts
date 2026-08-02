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

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma, StockAlertAckRecord as DbAck } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

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
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

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
  public async persistedUpsert(record: StockAlertAckRecord): Promise<StockAlertAckRecord> { if (!this.prisma) return this.upsert(record); const row = await this.inTenant(record.tenantId, (tx) => tx.stockAlertAckRecord.upsert({ where: { tenantId_alertKey: { tenantId: record.tenantId, alertKey: record.alertKey } }, create: { id: `saa-${record.tenantId.slice(0, 8)}-${randomUUID()}`, ...record, acknowledgedAt: new Date(record.acknowledgedAt) }, update: { acknowledgedBy: record.acknowledgedBy, note: record.note, acknowledgedAt: new Date(record.acknowledgedAt) } })); return this.map(row); }

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
  public async persistedFind(tenantId: string, alertType: "lowStock" | "expiring", targetId: string): Promise<StockAlertAckRecord | null> { if (!this.prisma) return this.find(tenantId, alertType, targetId); const row = await this.inTenant(tenantId, (tx) => tx.stockAlertAckRecord.findFirst({ where: { tenantId, alertType, targetId } })); return row ? this.map(row) : null; }

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
  public async persistedListForTenant(tenantId: string): Promise<StockAlertAckRecord[]> { if (!this.prisma) return this.listForTenant(tenantId); const rows = await this.inTenant(tenantId, (tx) => tx.stockAlertAckRecord.findMany({ where: { tenantId } })); return rows.map((row) => this.map(row)); }

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
  public async persistedClearForTenant(tenantId: string): Promise<number> { if (!this.prisma) return this.clearForTenant(tenantId); return this.inTenant(tenantId, async (tx) => (await tx.stockAlertAckRecord.deleteMany({ where: { tenantId } })).count); }

  /** Test yardımcısı. */
  public clear(): void {
    this.byTenantAndKey.clear();
    this.byTenant.clear();
  }

  private compositeKey(tenantId: string, alertKey: string): string {
    return `${tenantId}|${alertKey}`;
  }
  private map(row: DbAck): StockAlertAckRecord { return { tenantId: row.tenantId, alertKey: row.alertKey, alertType: row.alertType as StockAlertAckRecord["alertType"], targetId: row.targetId, acknowledgedAt: row.acknowledgedAt.toISOString(), acknowledgedBy: row.acknowledgedBy, note: row.note }; }
  private async inTenant<T>(tenantId: string, callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> { if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı"); return this.prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`; await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`; return callback(tx); }); }
}
