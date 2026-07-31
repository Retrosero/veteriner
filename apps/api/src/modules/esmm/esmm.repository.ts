/**
 * @file EsmmDocument repository (in-memory).
 * @module apps/api/modules/esmm/esmm.repository
 *
 * @description GOAL-077 e-SMM belge repository (in-memory).
 * DB migration sonraya bırakıldı.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import { Injectable } from "@nestjs/common";

import type {
  EsmmDocumentRecord,
} from "../../common/esmm/esmm.types.js";
import type {
  EsmmDocumentStatus,
  EsmmDocumentType,
} from "@vetniva/contracts";

/** Patch tipi. */
export interface EsmmDocumentPatch {
  status?: EsmmDocumentStatus | undefined;
  providerDocumentId?: string | null | undefined;
  providerDocumentNumber?: string | null | undefined;
  providerMessage?: string | null | undefined;
  manualDocumentNumber?: string | null | undefined;
  lastAttemptAt?: string | null | undefined;
  acceptedAt?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface EsmmDocumentSearchFilters {
  type?: EsmmDocumentType | undefined;
  status?: EsmmDocumentStatus | undefined;
  sourceType?: "clinic_sale" | "petshop_sale" | undefined;
  sourceId?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class EsmmDocumentsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, EsmmDocumentRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `doc-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: EsmmDocumentRecord): EsmmDocumentRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): EsmmDocumentRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: EsmmDocumentPatch,
  ): EsmmDocumentRecord | null {
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
    filters: EsmmDocumentSearchFilters,
  ): { items: EsmmDocumentRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: EsmmDocumentRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.type && rec.type !== filters.type) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.sourceType && rec.sourceType !== filters.sourceType)
        continue;
      if (filters.sourceId && rec.sourceId !== filters.sourceId)
        continue;
      if (needle) {
        const hay = [
          rec.id,
          rec.sourceId,
          rec.manualDocumentNumber ?? "",
          rec.providerDocumentNumber ?? "",
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
    this.counters.clear();
  }
}
