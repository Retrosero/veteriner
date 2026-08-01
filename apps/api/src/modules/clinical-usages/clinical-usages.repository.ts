/**
 * @file ClinicalUsage repository (in-memory).
 * @module apps/api/modules/clinical-usages/clinical-usages.repository
 *
 * @description GOAL-066 klinik tüketimden otomatik stok düşümü
 * veri erişim katmanı. DB migration sonraya bırakıldı; tenant-
 * scoped in-memory Map kullanılır.
 *
 * İndeksler:
 * - `byId`              — id → record.
 * - `lineById`          — lineId → record.
 * - `linesByUsage`      — usageId → lineId[].
 * - `byIdempotencyKey`  — tenantId|key → record id.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { Injectable } from "@nestjs/common";

import type {
  ClinicalUsageLineRecord,
  ClinicalUsageRecord,
} from "../../common/clinical-usages/clinical-usage.types.js";
import type { ClinicalUsageSourceType } from "@vetniva/contracts";

/** Arama filtreleri. */
export interface ClinicalUsageSearchFilters {
  sourceType?: ClinicalUsageSourceType | undefined;
  sourceId?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ClinicalUsagesRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, ClinicalUsageRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, ClinicalUsageLineRecord>();
  /** key: usageId → lineId[]. */
  private readonly linesByUsage = new Map<string, string[]>();
  /**
   * key: tenantId|idempotencyKey → record id. null key kullanılmaz
   * (idempotencyKey opsiyonel; null olanlar bu indekse eklenmez).
   */
  private readonly byIdempotencyKey = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için line id counter. */
  private readonly lineCounters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `cu-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `cul-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ClinicalUsageRecord): ClinicalUsageRecord {
    this.byId.set(record.id, record);
    this.linesByUsage.set(record.id, []);
    if (record.idempotencyKey !== null) {
      this.byIdempotencyKey.set(
        this.idempotencyKeyMapKey(record.tenantId, record.idempotencyKey),
        record.id,
      );
    }
    return record;
  }

  public insertLine(record: ClinicalUsageLineRecord): ClinicalUsageLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesByUsage.get(record.usageId) ?? [];
    list.push(record.id);
    this.linesByUsage.set(record.usageId, list);
    return record;
  }

  public findById(tenantId: string, id: string): ClinicalUsageRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findByIdempotencyKey(
    tenantId: string,
    key: string,
  ): ClinicalUsageRecord | null {
    const id = this.byIdempotencyKey.get(
      this.idempotencyKeyMapKey(tenantId, key),
    );
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listLinesByUsage(
    tenantId: string,
    usageId: string,
  ): ClinicalUsageLineRecord[] {
    const ids = this.linesByUsage.get(usageId) ?? [];
    const out: ClinicalUsageLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public search(
    tenantId: string,
    filters: ClinicalUsageSearchFilters,
  ): { items: ClinicalUsageRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: ClinicalUsageRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.sourceType && rec.sourceType !== filters.sourceType) continue;
      if (filters.sourceId && rec.sourceId !== filters.sourceId) continue;
      if (needle) {
        const hay = [rec.id, rec.sourceId, rec.notes ?? ""]
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
    this.linesByUsage.clear();
    this.byIdempotencyKey.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }

  private idempotencyKeyMapKey(tenantId: string, key: string): string {
    return `${tenantId}|${key}`;
  }
}
