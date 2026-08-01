/**
 * @file Imaging order repository (in-memory).
 * @module apps/api/modules/imaging-orders/imaging-orders.repository
 *
 * @description GOAL-093 görüntüleme isteği veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır.
 *
 * - `byId`: id → record
 * - `counters`: tenant bazlı id sayacı
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 */

import { Injectable } from "@nestjs/common";

import type {
  ImagingOrderRecord,
  ImagingReportRecord,
} from "../../common/imaging-orders/imaging-order.types.js";
import type {
  ImagingModality,
  ImagingOrderSourceType,
  ImagingOrderStatus,
} from "@vetniva/contracts";

/** Patch tipi. */
export interface ImagingOrderPatch {
  status?: ImagingOrderStatus | undefined;
  scheduledAt?: string | null | undefined;
  scheduledLocation?: string | null | undefined;
  performedAt?: string | null | undefined;
  performedByUserId?: string | null | undefined;
  contrastUse?: "none" | "iv" | "oral" | "rectal" | "other" | null | undefined;
  clinicalInfo?: string | null | undefined;
  attachments?: string[] | undefined;
  reportRevisions?: ImagingReportRecord[] | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface ImagingOrderSearchFilters {
  status?: ImagingOrderStatus | undefined;
  modality?: ImagingModality | undefined;
  patientId?: string | undefined;
  sourceType?: ImagingOrderSourceType | undefined;
  sourceId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ImagingOrdersRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, ImagingOrderRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `io-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ImagingOrderRecord): ImagingOrderRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): ImagingOrderRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: ImagingOrderPatch,
  ): ImagingOrderRecord | null {
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
    filters: ImagingOrderSearchFilters,
  ): { items: ImagingOrderRecord[]; total: number } {
    const all: ImagingOrderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.modality && rec.modality !== filters.modality) continue;
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
    this.counters.clear();
  }
}
