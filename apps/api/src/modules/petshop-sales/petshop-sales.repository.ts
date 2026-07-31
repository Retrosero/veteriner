/**
 * @file PetshopSale (POS) repository (in-memory).
 * @module apps/api/modules/petshop-sales/petshop-sales.repository
 *
 * @description GOAL-064 petshop POS veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-064 (FAZ-6) petshop POS core
 */

import { Injectable } from "@nestjs/common";

import type {
  PetshopSaleLineRecord,
  PetshopSaleRecord,
} from "../../common/petshop-sales/petshop-sale.types.js";
import type {
  PetshopSaleStatus,
  PetshopPaymentMethod,
} from "@vetniva/contracts";

/** Sale patch tipi. */
export interface PetshopSalePatch {
  status?: PetshopSaleStatus | undefined;
  customerOwnerId?: string | null | undefined;
  customerPatientId?: string | null | undefined;
  paymentMethod?: PetshopPaymentMethod | undefined;
  paidAmount?: string | undefined;
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

/** Line patch tipi. */
export interface PetshopSaleLinePatch {
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface PetshopSaleSearchFilters {
  status?: PetshopSaleStatus | undefined;
  customerOwnerId?: string | undefined;
  customerPatientId?: string | undefined;
  paymentMethod?: PetshopPaymentMethod | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PetshopSalesRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, PetshopSaleRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, PetshopSaleLineRecord>();
  /** key: saleId → lineId[]. */
  private readonly linesBySale = new Map<string, string[]>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için line id counter. */
  private readonly lineCounters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `ps-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `psl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PetshopSaleRecord): PetshopSaleRecord {
    this.byId.set(record.id, record);
    this.linesBySale.set(record.id, []);
    return record;
  }

  public insertLine(
    record: PetshopSaleLineRecord,
  ): PetshopSaleLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesBySale.get(record.saleId) ?? [];
    list.push(record.id);
    this.linesBySale.set(record.saleId, list);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): PetshopSaleRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineById(
    tenantId: string,
    lineId: string,
  ): PetshopSaleLineRecord | null {
    const rec = this.lineById.get(lineId);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listLinesBySale(
    tenantId: string,
    saleId: string,
  ): PetshopSaleLineRecord[] {
    const ids = this.linesBySale.get(saleId) ?? [];
    const out: PetshopSaleLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: PetshopSalePatch,
  ): PetshopSaleRecord | null {
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
    patch: PetshopSaleLinePatch,
  ): PetshopSaleLineRecord | null {
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

  public search(
    tenantId: string,
    filters: PetshopSaleSearchFilters,
  ): { items: PetshopSaleRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PetshopSaleRecord[] = [];
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
      if (
        filters.paymentMethod &&
        rec.paymentMethod !== filters.paymentMethod
      )
        continue;
      if (needle) {
        const hay = [rec.id, rec.notes ?? ""].join(" ").toLowerCase();
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
