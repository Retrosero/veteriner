/**
 * @file SurgeryPlan repository (in-memory).
 * @module apps/api/modules/surgery-plans/surgery-plans.repository
 *
 * @description GOAL-080 ameliyat planı veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
 */

import { Injectable } from "@nestjs/common";

import type { SurgeryPlanRecord } from "../../common/surgery-plans/surgery-plan.types.js";
import type { SurgeryPlanStatus } from "@vetniva/contracts";

/** Patch tipi. */
export interface SurgeryPlanPatch {
  operationType?: string | undefined;
  scheduledAt?: string | undefined;
  appointmentId?: string | null | undefined;
  notes?: string | null | undefined;
  status?: SurgeryPlanStatus | undefined;
  startedAt?: string | null | undefined;
  startedBy?: string | null | undefined;
  completedAt?: string | null | undefined;
  completedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface SurgeryPlanSearchFilters {
  status?: SurgeryPlanStatus | undefined;
  patientId?: string | undefined;
  leadSurgeonUserId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class SurgeryPlansRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, SurgeryPlanRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `sg-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: SurgeryPlanRecord): SurgeryPlanRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): SurgeryPlanRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: SurgeryPlanPatch,
  ): SurgeryPlanRecord | null {
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
    filters: SurgeryPlanSearchFilters,
  ): { items: SurgeryPlanRecord[]; total: number } {
    const all: SurgeryPlanRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (
        filters.leadSurgeonUserId &&
        rec.leadSurgeonUserId !== filters.leadSurgeonUserId
      )
        continue;
      if (filters.from) {
        const day = rec.scheduledAt.slice(0, 10);
        if (day < filters.from) continue;
      }
      if (filters.to) {
        const day = rec.scheduledAt.slice(0, 10);
        if (day > filters.to) continue;
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.scheduledAt.localeCompare(b.scheduledAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}
