/**
 * @file Lab adapter ledger repository (in-memory).
 * @module apps/api/modules/lab-adapters/lab-adapters.repository
 *
 * @description GOAL-094 (FAZ-9) cihaz/dış lab adapter export
 *   + import kayıtları veri erişim katmanı. DB migration sonraya
 *   bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 *   - `byIdExport` / `byIdImport`: id → record
 *   - `byOrderExport` / `byOrderImport`: tenantId::labOrderId → id[]
 *     (sıralı ekleme, sonuncusu en yeni)
 *   - `counters`: tenant bazlı id sayacı
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *   Fiziksel silme YOKTUR; düzeltme `status` alanı ile yapılır.
 *
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import { Injectable } from "@nestjs/common";

import type {
  LabAdapterExportRecord,
  LabAdapterImportRecord,
} from "../../common/lab-adapters/lab-adapter.types.js";
import type {
  LabAdapterExportStatus,
  LabAdapterImportStatus,
  LabAdapterType,
} from "@vetniva/contracts";

/** Export patch tipi. */
export interface LabAdapterExportPatch {
  status?: LabAdapterExportStatus | undefined;
  providerReference?: string | null | undefined;
  providerMessage?: string | null | undefined;
  attemptCount?: number | undefined;
  lastAttemptAt?: string | null | undefined;
  lastError?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Import patch tipi. */
export interface LabAdapterImportPatch {
  status?: LabAdapterImportStatus | undefined;
  rawPayload?: Record<string, unknown> | undefined;
  mappedResultId?: string | null | undefined;
  mappedAt?: string | null | undefined;
  mappedBy?: string | null | undefined;
  errorMessage?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Export arama filtreleri. */
export interface LabAdapterExportSearchFilters {
  labOrderId?: string | undefined;
  adapterType?: LabAdapterType | undefined;
  status?: LabAdapterExportStatus | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

/** Import arama filtreleri. */
export interface LabAdapterImportSearchFilters {
  labOrderId?: string | undefined;
  adapterType?: LabAdapterType | undefined;
  status?: LabAdapterImportStatus | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class LabAdaptersRepository {
  /** key: id → export record. */
  private readonly byIdExport = new Map<string, LabAdapterExportRecord>();
  /** key: id → import record. */
  private readonly byIdImport = new Map<string, LabAdapterImportRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  /* ------------------------------------------------------------------------
   * Export
   * ---------------------------------------------------------------------- */

  public nextExportId(tenantId: string): string {
    const n = (this.counters.get(`ex:${tenantId}`) ?? 0) + 1;
    this.counters.set(`ex:${tenantId}`, n);
    return `lax-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insertExport(record: LabAdapterExportRecord): LabAdapterExportRecord {
    this.byIdExport.set(record.id, record);
    return record;
  }

  public findExportById(
    tenantId: string,
    id: string,
  ): LabAdapterExportRecord | null {
    const rec = this.byIdExport.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateExport(
    tenantId: string,
    id: string,
    patch: LabAdapterExportPatch,
  ): LabAdapterExportRecord | null {
    const rec = this.findExportById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byIdExport.set(id, rec);
    return rec;
  }

  /** Order için en yeni export kaydını döner (varsa). */
  public findLatestExportByOrder(
    tenantId: string,
    labOrderId: string,
  ): LabAdapterExportRecord | null {
    let latest: LabAdapterExportRecord | null = null;
    for (const rec of this.byIdExport.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.labOrderId !== labOrderId) continue;
      if (!latest || rec.createdAt > latest.createdAt) {
        latest = rec;
      }
    }
    return latest;
  }

  /**
   * Idempotency: aynı (tenantId, labOrderId, idempotencyKey) ile
   * mevcut export kaydını döner (varsa). HTTP idempotency için.
   */
  public findExportByIdempotencyKey(
    tenantId: string,
    labOrderId: string,
    idempotencyKey: string,
  ): LabAdapterExportRecord | null {
    for (const rec of this.byIdExport.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.labOrderId !== labOrderId) continue;
      if (rec.idempotencyKey === idempotencyKey) return rec;
    }
    return null;
  }

  public searchExports(
    tenantId: string,
    filters: LabAdapterExportSearchFilters,
  ): { items: LabAdapterExportRecord[]; total: number } {
    const all: LabAdapterExportRecord[] = [];
    for (const rec of this.byIdExport.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.labOrderId && rec.labOrderId !== filters.labOrderId) continue;
      if (filters.adapterType && rec.adapterType !== filters.adapterType)
        continue;
      if (filters.status && rec.status !== filters.status) continue;
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

  /* ------------------------------------------------------------------------
   * Import
   * ---------------------------------------------------------------------- */

  public nextImportId(tenantId: string): string {
    const n = (this.counters.get(`im:${tenantId}`) ?? 0) + 1;
    this.counters.set(`im:${tenantId}`, n);
    return `lai-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insertImport(record: LabAdapterImportRecord): LabAdapterImportRecord {
    this.byIdImport.set(record.id, record);
    return record;
  }

  public findImportById(
    tenantId: string,
    id: string,
  ): LabAdapterImportRecord | null {
    const rec = this.byIdImport.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateImport(
    tenantId: string,
    id: string,
    patch: LabAdapterImportPatch,
  ): LabAdapterImportRecord | null {
    const rec = this.findImportById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byIdImport.set(id, rec);
    return rec;
  }

  public searchImports(
    tenantId: string,
    filters: LabAdapterImportSearchFilters,
  ): { items: LabAdapterImportRecord[]; total: number } {
    const all: LabAdapterImportRecord[] = [];
    for (const rec of this.byIdImport.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.labOrderId && rec.labOrderId !== filters.labOrderId) continue;
      if (filters.adapterType && rec.adapterType !== filters.adapterType)
        continue;
      if (filters.status && rec.status !== filters.status) continue;
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
    this.byIdExport.clear();
    this.byIdImport.clear();
    this.counters.clear();
  }
}
