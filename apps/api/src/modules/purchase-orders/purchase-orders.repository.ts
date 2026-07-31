/**
 * @file PurchaseOrder (satın alma siparişi) repository (in-memory).
 * @module apps/api/modules/purchase-orders/purchase-orders.repository
 *
 * @description GOAL-062 satın alma siparişi veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek (API
 * sözleşmesi sabit kalır).
 *
 * İndeksler:
 * - `byId`        — id → record (header).
 * - `lineById`    — lineId → record (line).
 * - `linesByOrder`— orderId → lineId[].
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { Injectable } from "@nestjs/common";

import type {
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
} from "../../common/purchase-orders/purchase-order.types.js";
import type {
  PurchaseOrderStatus,
} from "@vetniva/contracts";

/** Sipariş patch tipi. */
export interface PurchaseOrderPatch {
  status?: PurchaseOrderStatus | undefined;
  supplierId?: string | undefined;
  branchId?: string | null | undefined;
  currency?: string | undefined;
  expectedAt?: string | null | undefined;
  notes?: string | null | undefined;
  approvedAt?: string | null | undefined;
  approvedBy?: string | null | undefined;
  receivedAt?: string | null | undefined;
  receivedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  totalAmount?: string | undefined;
  updatedAt?: string | undefined;
}

/** Satır patch tipi. */
export interface PurchaseOrderLinePatch {
  receivedQuantity?: string | undefined;
  unitCost?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface PurchaseOrderSearchFilters {
  status?: PurchaseOrderStatus | undefined;
  supplierId?: string | undefined;
  branchId?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PurchaseOrdersRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, PurchaseOrderRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, PurchaseOrderLineRecord>();
  /** key: orderId → lineId listesi (sıra korunur). */
  private readonly linesByOrder = new Map<string, string[]>();
  /** Her tenant için id counter (header). */
  private readonly counters = new Map<string, number>();
  /** Her tenant için id counter (line). */
  private readonly lineCounters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `po-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `pol-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PurchaseOrderRecord): PurchaseOrderRecord {
    this.byId.set(record.id, record);
    this.linesByOrder.set(record.id, []);
    return record;
  }

  public insertLine(
    record: PurchaseOrderLineRecord,
  ): PurchaseOrderLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesByOrder.get(record.purchaseOrderId) ?? [];
    list.push(record.id);
    this.linesByOrder.set(record.purchaseOrderId, list);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): PurchaseOrderRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineById(
    tenantId: string,
    lineId: string,
  ): PurchaseOrderLineRecord | null {
    const rec = this.lineById.get(lineId);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineByOrderAndId(
    tenantId: string,
    orderId: string,
    lineId: string,
  ): PurchaseOrderLineRecord | null {
    const rec = this.findLineById(tenantId, lineId);
    if (!rec) return null;
    if (rec.purchaseOrderId !== orderId) return null;
    return rec;
  }

  public listLinesByOrder(
    tenantId: string,
    orderId: string,
  ): PurchaseOrderLineRecord[] {
    const ids = this.linesByOrder.get(orderId) ?? [];
    const out: PurchaseOrderLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: PurchaseOrderPatch,
  ): PurchaseOrderRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byId.set(id, rec);
    return rec;
  }

  public updateLine(
    tenantId: string,
    lineId: string,
    patch: PurchaseOrderLinePatch,
  ): PurchaseOrderLineRecord | null {
    const rec = this.findLineById(tenantId, lineId);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.lineById.set(lineId, rec);
    return rec;
  }

  /**
   * Tenant-scoped arama. En yeni kayıt üstte (default desc).
   */
  public search(
    tenantId: string,
    filters: PurchaseOrderSearchFilters,
  ): { items: PurchaseOrderRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PurchaseOrderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.supplierId && rec.supplierId !== filters.supplierId)
        continue;
      if (filters.branchId && rec.branchId !== filters.branchId)
        continue;
      if (needle) {
        const hay = [
          rec.id,
          rec.supplierId,
          rec.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.lineById.clear();
    this.linesByOrder.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }
}
