/**
 * @file Lab test kataloğu repository (in-memory).
 * @module apps/api/modules/lab-tests/lab-tests.repository
 *
 * @description GOAL-090 laboratuvar test kataloğu veri erişim
 * katmanı. DB migration sonraya bırakıldı; tenant-scoped
 * in-memory Map kullanılır.
 *
 * - `byId`: id → record
 * - `byCode`: tenantId::code → id (case-insensitive unique)
 * - `counters`: tenant bazlı id sayacı
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *   `code` tenant-scoped unique (büyük/küçük harf duyarsız).
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 */

import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { LabTestRecord } from "../../common/lab-tests/lab-test.types.js";
import type { LabSampleType } from "@vetniva/contracts";

/** Patch tipi. */
export interface LabTestPatch {
  name?: string | undefined;
  unit?: string | undefined;
  referenceRange?: string | null | undefined;
  conditionalRanges?: string | null | undefined;
  price?: string | undefined;
  active?: boolean | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface LabTestSearchFilters {
  sampleType?: LabSampleType | undefined;
  active?: boolean | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class LabTestsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, LabTestRecord>();
  /** key: tenantId::codeLower → id. */
  private readonly byCode = new Map<string, string>();
  public nextId(_tenantId: string): string {
    return randomUUID();
  }

  public codeKey(tenantId: string, code: string): string {
    return `${tenantId}::${code.trim().toLowerCase()}`;
  }

  public findByCode(tenantId: string, code: string): LabTestRecord | null {
    const id = this.byCode.get(this.codeKey(tenantId, code));
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  public insert(record: LabTestRecord): LabTestRecord {
    this.byId.set(record.id, record);
    this.byCode.set(this.codeKey(record.tenantId, record.code), record.id);
    return record;
  }

  public findById(tenantId: string, id: string): LabTestRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: LabTestPatch,
  ): LabTestRecord | null {
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
    filters: LabTestSearchFilters,
  ): { items: LabTestRecord[]; total: number } {
    const searchTerm = filters.search?.trim().toLowerCase();
    const all: LabTestRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.sampleType && rec.sampleType !== filters.sampleType) continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      if (searchTerm) {
        const codeMatch = rec.code.toLowerCase().includes(searchTerm);
        const nameMatch = rec.name.toLowerCase().includes(searchTerm);
        if (!codeMatch && !nameMatch) continue;
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "asc";
    all.sort((a, b) => {
      const cmp = a.code.localeCompare(b.code, "tr");
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byCode.clear();
  }
}
