/**
 * @file ClinicSale repository (in-memory).
 * @module apps/api/modules/clinic-sales/clinic-sales.repository
 *
 * @description GOAL-071 klinik satış taslağı veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
 */

import { Injectable } from "@nestjs/common";

import type {
  ClinicSaleLineRecord,
  ClinicSaleRecord,
} from "../../common/clinic-sales/clinic-sale.types.js";
import type {
  ClinicSaleSourceType,
  ClinicSaleStatus,
} from "@vetniva/contracts";

/** Sale patch tipi. */
export interface ClinicSalePatch {
  status?: ClinicSaleStatus | undefined;
  totalAmount?: string | undefined;
  globalDiscountPercent?: number | undefined;
  netAmount?: string | undefined;
  notes?: string | null | undefined;
  completedAt?: string | null | undefined;
  completedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface ClinicSaleSearchFilters {
  status?: ClinicSaleStatus | undefined;
  customerOwnerId?: string | undefined;
  customerPatientId?: string | undefined;
  sourceType?: ClinicSaleSourceType | undefined;
  sourceId?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ClinicSalesRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, ClinicSaleRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, ClinicSaleLineRecord>();
  /** key: saleId → lineId[]. */
  private readonly linesBySale = new Map<string, string[]>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için line id counter. */
  private readonly lineCounters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `cs-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `csl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ClinicSaleRecord): ClinicSaleRecord {
    this.byId.set(record.id, record);
    this.linesBySale.set(record.id, []);
    return record;
  }

  public insertLine(
    record: ClinicSaleLineRecord,
  ): ClinicSaleLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesBySale.get(record.saleId) ?? [];
    list.push(record.id);
    this.linesBySale.set(record.saleId, list);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): ClinicSaleRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listLinesBySale(
    tenantId: string,
    saleId: string,
  ): ClinicSaleLineRecord[] {
    const ids = this.linesBySale.get(saleId) ?? [];
    const out: ClinicSaleLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: ClinicSalePatch,
  ): ClinicSaleRecord | null {
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
    filters: ClinicSaleSearchFilters,
  ): { items: ClinicSaleRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: ClinicSaleRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.customerOwnerId &&
        rec.customerOwnerId !== filters.customerOwnerId
      )
        continue;
      if (
        filters.customerPatientId &&
        rec.customerPatientId !== filters.customerPatientId
      )
        continue;
      if (filters.sourceType && rec.sourceType !== filters.sourceType)
        continue;
      if (filters.sourceId && rec.sourceId !== filters.sourceId)
        continue;
      if (needle) {
        const hay = [
          rec.id,
          rec.sourceId,
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
    this.linesBySale.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }
}
