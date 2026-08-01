/**
 * @file Orders repository (in-memory).
 * @module apps/api/modules/orders/orders.repository
 *
 * @description Order veri erişim katmanı. GOAL-044 kapsamında DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
 */

import { Injectable } from "@nestjs/common";

import type { Order, OrderStatus } from "@vetniva/contracts";

/** Persist edilmiş order record. */
export interface OrderRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  patientId: string;
  type: Order["type"];
  status: OrderStatus;
  description: string;
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  createdBy: string;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

@Injectable()
export class OrdersRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, OrderRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `order-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: OrderRecord): OrderRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): OrderRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır (örn. `completedAt`).
   */
  public update(
    tenantId: string,
    id: string,
    patch: {
      status?: OrderStatus | undefined;
      notes?: string | null | undefined;
      completedAt?: string | null | undefined;
      completedBy?: string | null | undefined;
      cancelledAt?: string | null | undefined;
      cancellationReason?: string | null | undefined;
    },
  ): OrderRecord | null {
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

  /**
   * Tenant-scoped liste + filtre. `from`/`to` aralığı `createdAt`
   * alanına göre uygulanır. En yeni order üstte.
   */
  public search(
    tenantId: string,
    filters: {
      patientId?: string | undefined;
      type?: Order["type"] | undefined;
      status?: OrderStatus | undefined;
      from?: string | undefined;
      to?: string | undefined;
      limit: number;
      offset: number;
    },
  ): { items: OrderRecord[]; total: number } {
    const all: OrderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.type && rec.type !== filters.type) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.from && rec.createdAt < filters.from) continue;
      if (filters.to && rec.createdAt > filters.to) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  public toRecord(args: OrderRecord): OrderRecord {
    return { ...args };
  }
}

/** Record → public Order (API response). */
export function toOrder(rec: OrderRecord): Order {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    patientId: rec.patientId,
    type: rec.type,
    status: rec.status,
    description: rec.description,
    notes: rec.notes,
    dueDate: rec.dueDate,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    completedAt: rec.completedAt,
    completedBy: rec.completedBy,
    cancelledAt: rec.cancelledAt,
    cancellationReason: rec.cancellationReason,
  };
}
