/**
 * @file Lab order repository (in-memory).
 * @module apps/api/modules/lab-orders/lab-orders.repository
 *
 * @description GOAL-091 laboratuvar isteği veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır.
 *
 * - `byId`: id → record
 * - `byPatient`: tenantId::patientId → id[] (sıralı ekleme)
 * - `counters`: tenant bazlı id sayacı
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 */

import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { LabOrderRecord } from "../../common/lab-orders/lab-order.types.js";
import type { LabOrderSourceType, LabOrderStatus } from "@vetniva/contracts";

/** Patch tipi. */
export interface LabOrderPatch {
  status?: LabOrderStatus | undefined;
  collectedAt?: string | null | undefined;
  collectedByUserId?: string | null | undefined;
  sampleQuality?:
    | "ok"
    | "hemolyzed"
    | "insufficient"
    | "contaminated"
    | "other"
    | null
    | undefined;
  processingStartedAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface LabOrderSearchFilters {
  status?: LabOrderStatus | undefined;
  patientId?: string | undefined;
  sourceType?: LabOrderSourceType | undefined;
  sourceId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class LabOrdersRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, LabOrderRecord>();
  public nextId(_tenantId: string): string {
    return randomUUID();
  }

  public insert(record: LabOrderRecord): LabOrderRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): LabOrderRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: LabOrderPatch,
  ): LabOrderRecord | null {
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

  public search(
    tenantId: string,
    filters: LabOrderSearchFilters,
  ): { items: LabOrderRecord[]; total: number } {
    const all: LabOrderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.sourceType && rec.sourceType !== filters.sourceType) continue;
      if (filters.sourceId && rec.sourceId !== filters.sourceId) continue;
      if (filters.dateFrom && rec.createdAt < filters.dateFrom) continue;
      if (filters.dateTo && rec.createdAt > filters.dateTo) continue;
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
  }
}
