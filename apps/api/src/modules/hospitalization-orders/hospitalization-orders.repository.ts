/**
 * @file HospitalizationOrder repository (in-memory).
 * @module apps/api/modules/hospitalization-orders/hospitalization-orders.repository
 *
 * @description GOAL-085 yatış order + schedule veri erişim
 * katmanı. DB migration sonraya bırakıldı; tenant-scoped in-memory
 * Map kullanılır. 2 varlık (order, schedule) ayrı Map'lerde tutulur.
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import { Injectable } from "@nestjs/common";

import type {
  HospitalizationOrderRecord,
  HospitalizationOrderScheduleRecord,
} from "../../common/hospitalization-orders/hospitalization-order.types.js";
import type {
  HospitalizationOrderPriority,
  HospitalizationOrderStatus,
  HospitalizationOrderType,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Patch tipleri
 * --------------------------------------------------------------------------
 */

export interface HospitalizationOrderPatch {
  instructions?: string | undefined;
  frequency?: string | null | undefined;
  priority?: HospitalizationOrderPriority | undefined;
  endsAt?: string | null | undefined;
  notes?: string | null | undefined;
  status?: HospitalizationOrderStatus | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

export interface HospitalizationOrderSchedulePatch {
  appliedAt?: string | null | undefined;
  appliedByUserId?: string | null | undefined;
  skippedAt?: string | null | undefined;
  skippedByUserId?: string | null | undefined;
  skipReason?: string | null | undefined;
}

/* --------------------------------------------------------------------------
 * Arama filtreleri
 * --------------------------------------------------------------------------
 */

export interface HospitalizationOrderSearchFilters {
  hospitalizationId?: string | undefined;
  orderType?: HospitalizationOrderType | undefined;
  status?: HospitalizationOrderStatus | undefined;
  priority?: HospitalizationOrderPriority | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

export interface HospitalizationOrderScheduleSearchFilters {
  orderId?: string | undefined;
  status?: "pending" | "applied" | "skipped" | "overdue" | undefined;
  asOf?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class HospitalizationOrdersRepository {
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string, prefix: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Order
  // -------------------------------------------------------------------------

  private readonly orders = new Map<string, HospitalizationOrderRecord>();

  public insertOrder(
    rec: HospitalizationOrderRecord,
  ): HospitalizationOrderRecord {
    this.orders.set(rec.id, rec);
    return rec;
  }

  public findOrderById(
    tenantId: string,
    id: string,
  ): HospitalizationOrderRecord | null {
    const rec = this.orders.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateOrder(
    tenantId: string,
    id: string,
    patch: HospitalizationOrderPatch,
  ): HospitalizationOrderRecord | null {
    const rec = this.findOrderById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.orders.set(id, rec);
    return rec;
  }

  public searchOrders(
    tenantId: string,
    filters: HospitalizationOrderSearchFilters,
  ): { items: HospitalizationOrderRecord[]; total: number } {
    const all: HospitalizationOrderRecord[] = [];
    for (const rec of this.orders.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (
        filters.hospitalizationId &&
        rec.hospitalizationId !== filters.hospitalizationId
      ) {
        continue;
      }
      if (filters.orderType && rec.orderType !== filters.orderType) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.priority && rec.priority !== filters.priority) continue;
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

  // -------------------------------------------------------------------------
  // Schedule
  // -------------------------------------------------------------------------

  private readonly schedules = new Map<
    string,
    HospitalizationOrderScheduleRecord
  >();

  public insertSchedule(
    rec: HospitalizationOrderScheduleRecord,
  ): HospitalizationOrderScheduleRecord {
    this.schedules.set(rec.id, rec);
    return rec;
  }

  public findScheduleById(
    tenantId: string,
    id: string,
  ): HospitalizationOrderScheduleRecord | null {
    const rec = this.schedules.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateSchedule(
    tenantId: string,
    id: string,
    patch: HospitalizationOrderSchedulePatch,
  ): HospitalizationOrderScheduleRecord | null {
    const rec = this.findScheduleById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.schedules.set(id, rec);
    return rec;
  }

  public listSchedules(
    tenantId: string,
    orderId: string,
  ): HospitalizationOrderScheduleRecord[] {
    const out: HospitalizationOrderScheduleRecord[] = [];
    for (const rec of this.schedules.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.orderId !== orderId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return out;
  }

  public searchSchedules(
    tenantId: string,
    filters: HospitalizationOrderScheduleSearchFilters,
  ): { items: HospitalizationOrderScheduleRecord[]; total: number } {
    const all: HospitalizationOrderScheduleRecord[] = [];
    for (const rec of this.schedules.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.orderId && rec.orderId !== filters.orderId) continue;
      if (filters.status) {
        const isPending = rec.appliedAt === null && rec.skippedAt === null;
        const isApplied = rec.appliedAt !== null;
        const isSkipped = rec.skippedAt !== null;
        if (filters.status === "pending" && !isPending) continue;
        if (filters.status === "applied" && !isApplied) continue;
        if (filters.status === "skipped" && !isSkipped) continue;
        if (filters.status === "overdue") {
          if (!isPending) continue;
          if (filters.asOf && rec.scheduledFor >= filters.asOf) continue;
        }
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "asc";
    all.sort((a, b) => {
      const cmp = a.scheduledFor.localeCompare(b.scheduledFor);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.counters.clear();
    this.orders.clear();
    this.schedules.clear();
  }
}
