/**
 * @file DischargeSummaries repository (in-memory).
 * @module apps/api/modules/discharge-summaries/discharge-summaries.repository
 *
 * @description GOAL-086 gözlem + taburcu özeti veri erişim
 * katmanı. DB migration sonraya bırakıldı; tenant-scoped in-memory
 * Map kullanılır. 2 varlık (observation, dischargeSummary) ayrı
 * Map'lerde tutulur.
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-086 (FAZ-8) gözlem ve taburcu özeti core
 */

import { Injectable } from "@nestjs/common";

import type {
  DischargeSummaryRecord,
  ObservationRecord,
} from "../../common/discharge-summaries/discharge-summary.types.js";
import type {
  DischargeMedicationItem,
  DischargeSummaryStatus,
  ObservationKind,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Patch tipleri
 * --------------------------------------------------------------------------
 */

export interface DischargeSummaryPatch {
  clinicalSummary?: string | undefined;
  treatments?: string | null | undefined;
  homeInstructions?: string | null | undefined;
  medications?: DischargeMedicationItem[] | null | undefined;
  followUpDate?: string | null | undefined;
  notes?: string | null | undefined;
  status?: DischargeSummaryStatus | undefined;
  finalizedAt?: string | null | undefined;
  finalizedBy?: string | null | undefined;
  portalShared?: boolean | undefined;
  portalSharedAt?: string | null | undefined;
  pdfGenerated?: boolean | undefined;
  pdfGeneratedAt?: string | null | undefined;
  updatedAt?: string | undefined;
}

/* --------------------------------------------------------------------------
 * Arama filtreleri
 * --------------------------------------------------------------------------
 */

export interface ObservationSearchFilters {
  hospitalizationId?: string | undefined;
  kind?: ObservationKind | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class DischargeSummariesRepository {
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string, prefix: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Observation
  // -------------------------------------------------------------------------

  private readonly observations = new Map<string, ObservationRecord>();

  public insertObservation(
    rec: ObservationRecord,
  ): ObservationRecord {
    this.observations.set(rec.id, rec);
    return rec;
  }

  public findObservationById(
    tenantId: string,
    id: string,
  ): ObservationRecord | null {
    const rec = this.observations.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public searchObservations(
    tenantId: string,
    filters: ObservationSearchFilters,
  ): { items: ObservationRecord[]; total: number } {
    const all: ObservationRecord[] = [];
    for (const rec of this.observations.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (
        filters.hospitalizationId &&
        rec.hospitalizationId !== filters.hospitalizationId
      ) {
        continue;
      }
      if (filters.kind && rec.kind !== filters.kind) continue;
      if (filters.from && rec.observedAt < filters.from) continue;
      if (filters.to && rec.observedAt > filters.to) continue;
      all.push(rec);
    }
    const sort = filters.sort ?? "asc";
    all.sort((a, b) => {
      const cmp = a.observedAt.localeCompare(b.observedAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // DischargeSummary
  // -------------------------------------------------------------------------

  private readonly summaries = new Map<string, DischargeSummaryRecord>();
  /** hospitalizationId → en son draft/finalized summary id (uniq). */
  private readonly activeByHosp = new Map<string, string>();

  public insertSummary(
    rec: DischargeSummaryRecord,
  ): DischargeSummaryRecord {
    this.summaries.set(rec.id, rec);
    this.activeByHosp.set(
      `${rec.tenantId}::${rec.hospitalizationId}`,
      rec.id,
    );
    return rec;
  }

  public findSummaryById(
    tenantId: string,
    id: string,
  ): DischargeSummaryRecord | null {
    const rec = this.summaries.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findActiveSummaryByHosp(
    tenantId: string,
    hospitalizationId: string,
  ): DischargeSummaryRecord | null {
    const id = this.activeByHosp.get(`${tenantId}::${hospitalizationId}`);
    if (!id) return null;
    return this.findSummaryById(tenantId, id);
  }

  public updateSummary(
    tenantId: string,
    id: string,
    patch: DischargeSummaryPatch,
  ): DischargeSummaryRecord | null {
    const rec = this.findSummaryById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.summaries.set(id, rec);
    return rec;
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.counters.clear();
    this.observations.clear();
    this.summaries.clear();
    this.activeByHosp.clear();
  }
}
