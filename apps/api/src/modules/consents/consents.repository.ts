/**
 * @file Consent repository (in-memory).
 * @module apps/api/modules/consents/consents.repository
 *
 * @description GOAL-081 onam formu veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-081 (FAZ-8) onam formları core
 */

import { Injectable } from "@nestjs/common";

import type {
  ConsentRecord,
} from "../../common/consents/consent.types.js";
import type {
  ConsentSignatureMethod,
  ConsentStatus,
  ConsentTemplateType,
} from "@vetniva/contracts";

/** Patch tipi. */
export interface ConsentPatch {
  status?: ConsentStatus | undefined;
  signatureMethod?: ConsentSignatureMethod | null | undefined;
  signatureProvider?: string | null | undefined;
  signatureReference?: string | null | undefined;
  signedAt?: string | null | undefined;
  revokedAt?: string | null | undefined;
  revokedBy?: string | null | undefined;
  revokeReason?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface ConsentSearchFilters {
  status?: ConsentStatus | undefined;
  templateType?: ConsentTemplateType | undefined;
  patientId?: string | undefined;
  ownerId?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ConsentsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, ConsentRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `cs-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ConsentRecord): ConsentRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): ConsentRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: ConsentPatch,
  ): ConsentRecord | null {
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
    filters: ConsentSearchFilters,
  ): { items: ConsentRecord[]; total: number } {
    const all: ConsentRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.templateType &&
        rec.templateType !== filters.templateType
      )
        continue;
      if (filters.patientId && rec.patientId !== filters.patientId)
        continue;
      if (filters.ownerId && rec.ownerId !== filters.ownerId)
        continue;
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
