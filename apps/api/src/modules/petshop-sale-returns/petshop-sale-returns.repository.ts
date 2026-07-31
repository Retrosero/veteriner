/**
 * @file PetshopSaleReturn repository (in-memory).
 * @module apps/api/modules/petshop-sale-returns/petshop-sale-returns.repository
 *
 * @description GOAL-065 petshop satış iadesi veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import { Injectable } from "@nestjs/common";

import type {
  PetshopSaleReturnLineRecord,
  PetshopSaleReturnRecord,
} from "../../common/petshop-sale-returns/petshop-sale-return.types.js";
import type {
  PetshopPaymentMethod,
  PetshopSaleReturnStatus,
} from "@vetniva/contracts";

/** Return patch tipi. */
export interface PetshopSaleReturnPatch {
  status?: PetshopSaleReturnStatus | undefined;
  refundMethod?: PetshopPaymentMethod | undefined;
  totalAmount?: string | undefined;
  globalDiscountPercent?: number | undefined;
  refundAmount?: string | undefined;
  notes?: string | null | undefined;
  completedAt?: string | null | undefined;
  completedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Line patch tipi. */
export interface PetshopSaleReturnLinePatch {
  reason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface PetshopSaleReturnSearchFilters {
  status?: PetshopSaleReturnStatus | undefined;
  originalSaleId?: string | undefined;
  customerOwnerId?: string | undefined;
  customerPatientId?: string | undefined;
  refundMethod?: PetshopPaymentMethod | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PetshopSaleReturnsRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, PetshopSaleReturnRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, PetshopSaleReturnLineRecord>();
  /** key: returnId → lineId[]. */
  private readonly linesByReturn = new Map<string, string[]>();
  /** key: originalSaleId → returnId[] (tenant-scoped arama için). */
  private readonly byOriginalSale = new Map<string, string[]>();
  /** Her tenant için return id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için line id counter. */
  private readonly lineCounters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `psr-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `psrl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PetshopSaleReturnRecord): PetshopSaleReturnRecord {
    this.byId.set(record.id, record);
    this.linesByReturn.set(record.id, []);
    const list =
      this.byOriginalSale.get(record.originalSaleId) ?? [];
    list.push(record.id);
    this.byOriginalSale.set(record.originalSaleId, list);
    return record;
  }

  public insertLine(
    record: PetshopSaleReturnLineRecord,
  ): PetshopSaleReturnLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesByReturn.get(record.returnId) ?? [];
    list.push(record.id);
    this.linesByReturn.set(record.returnId, list);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): PetshopSaleReturnRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineById(
    tenantId: string,
    lineId: string,
  ): PetshopSaleReturnLineRecord | null {
    const rec = this.lineById.get(lineId);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listLinesByReturn(
    tenantId: string,
    returnId: string,
  ): PetshopSaleReturnLineRecord[] {
    const ids = this.linesByReturn.get(returnId) ?? [];
    const out: PetshopSaleReturnLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public listReturnsByOriginalSale(
    tenantId: string,
    originalSaleId: string,
  ): PetshopSaleReturnRecord[] {
    const ids = this.byOriginalSale.get(originalSaleId) ?? [];
    const out: PetshopSaleReturnRecord[] = [];
    for (const id of ids) {
      const rec = this.byId.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: PetshopSaleReturnPatch,
  ): PetshopSaleReturnRecord | null {
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
    patch: PetshopSaleReturnLinePatch,
  ): PetshopSaleReturnLineRecord | null {
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
    filters: PetshopSaleReturnSearchFilters,
  ): { items: PetshopSaleReturnRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PetshopSaleReturnRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.originalSaleId &&
        rec.originalSaleId !== filters.originalSaleId
      )
        continue;
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
        filters.refundMethod &&
        rec.refundMethod !== filters.refundMethod
      )
        continue;
      if (needle) {
        const hay = [
          rec.id,
          rec.originalSaleId,
          rec.reason,
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
    this.linesByReturn.clear();
    this.byOriginalSale.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }
}
