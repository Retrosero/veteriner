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

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import type {
  DischargeSummaryRecord,
  ObservationRecord,
} from "../../common/discharge-summaries/discharge-summary.types.js";
import { PrismaService } from "../../prisma/prisma.service.js";
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
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string, prefix: string): string {
    if (this.prisma) return randomUUID();
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Observation
  // -------------------------------------------------------------------------

  private readonly observations = new Map<string, ObservationRecord>();

  public insertObservation(rec: ObservationRecord): ObservationRecord {
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

  public async persistObservation(
    rec: ObservationRecord,
  ): Promise<ObservationRecord> {
    if (!this.prisma) return this.insertObservation(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.observationRecord.create({
        data: {
          ...rec,
          kind: rec.kind,
          observedAt: new Date(rec.observedAt),
          createdAt: new Date(rec.createdAt),
        },
      }),
    );
    return {
      ...row,
      kind: row.kind as ObservationRecord["kind"],
      observedAt: row.observedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
  public async persistedObservations(
    tenantId: string,
    f: ObservationSearchFilters,
  ): Promise<{ items: ObservationRecord[]; total: number }> {
    if (!this.prisma) return this.searchObservations(tenantId, f);
    const where: Prisma.ObservationRecordWhereInput = {
      tenantId,
      ...(f.hospitalizationId
        ? { hospitalizationId: f.hospitalizationId }
        : {}),
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.from || f.to
        ? {
            observedAt: {
              ...(f.from ? { gte: new Date(f.from) } : {}),
              ...(f.to ? { lte: new Date(f.to) } : {}),
            },
          }
        : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.observationRecord.findMany({
          where,
          orderBy: { observedAt: f.sort ?? "asc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.observationRecord.count({ where }),
      ]);
      return {
        items: items.map((row) => ({
          ...row,
          kind: row.kind as ObservationRecord["kind"],
          observedAt: row.observedAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        })),
        total,
      };
    });
  }

  // -------------------------------------------------------------------------
  // DischargeSummary
  // -------------------------------------------------------------------------

  private readonly summaries = new Map<string, DischargeSummaryRecord>();
  /** hospitalizationId → en son draft/finalized summary id (uniq). */
  private readonly activeByHosp = new Map<string, string>();

  public insertSummary(rec: DischargeSummaryRecord): DischargeSummaryRecord {
    this.summaries.set(rec.id, rec);
    this.activeByHosp.set(`${rec.tenantId}::${rec.hospitalizationId}`, rec.id);
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

  public async persistSummary(
    rec: DischargeSummaryRecord,
  ): Promise<DischargeSummaryRecord> {
    if (!this.prisma) return this.insertSummary(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.dischargeSummaryRecord.create({
        data: {
          ...rec,
          status: rec.status,
          medications: rec.medications as Prisma.InputJsonValue,
          followUpDate: rec.followUpDate ? new Date(rec.followUpDate) : null,
          portalSharedAt: rec.portalSharedAt
            ? new Date(rec.portalSharedAt)
            : null,
          pdfGeneratedAt: rec.pdfGeneratedAt
            ? new Date(rec.pdfGeneratedAt)
            : null,
          finalizedAt: rec.finalizedAt ? new Date(rec.finalizedAt) : null,
          createdAt: new Date(rec.createdAt),
          updatedAt: new Date(rec.updatedAt),
        },
      }),
    );
    return this.mapSummary(row);
  }
  public async persistedSummaryById(
    tenantId: string,
    id: string,
  ): Promise<DischargeSummaryRecord | null> {
    if (!this.prisma) return this.findSummaryById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.dischargeSummaryRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapSummary(row) : null;
  }
  public async persistedActiveSummary(
    tenantId: string,
    hospitalizationId: string,
  ): Promise<DischargeSummaryRecord | null> {
    if (!this.prisma)
      return this.findActiveSummaryByHosp(tenantId, hospitalizationId);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.dischargeSummaryRecord.findFirst({
        where: {
          tenantId,
          hospitalizationId,
          status: { in: ["draft", "finalized"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    );
    return row ? this.mapSummary(row) : null;
  }
  public async persistedUpdateSummary(
    tenantId: string,
    id: string,
    p: DischargeSummaryPatch,
  ): Promise<DischargeSummaryRecord | null> {
    if (!this.prisma) return this.updateSummary(tenantId, id, p);
    const d: Prisma.DischargeSummaryRecordUpdateManyMutationInput = {
      ...(p.clinicalSummary !== undefined
        ? { clinicalSummary: p.clinicalSummary }
        : {}),
      ...(p.treatments !== undefined ? { treatments: p.treatments } : {}),
      ...(p.homeInstructions !== undefined
        ? { homeInstructions: p.homeInstructions }
        : {}),
      ...(p.medications !== undefined
        ? { medications: p.medications as Prisma.InputJsonValue }
        : {}),
      ...(p.followUpDate !== undefined
        ? { followUpDate: p.followUpDate ? new Date(p.followUpDate) : null }
        : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.finalizedAt !== undefined
        ? { finalizedAt: p.finalizedAt ? new Date(p.finalizedAt) : null }
        : {}),
      ...(p.finalizedBy !== undefined ? { finalizedBy: p.finalizedBy } : {}),
      ...(p.portalShared !== undefined ? { portalShared: p.portalShared } : {}),
      ...(p.portalSharedAt !== undefined
        ? {
            portalSharedAt: p.portalSharedAt
              ? new Date(p.portalSharedAt)
              : null,
          }
        : {}),
      ...(p.pdfGenerated !== undefined ? { pdfGenerated: p.pdfGenerated } : {}),
      ...(p.pdfGeneratedAt !== undefined
        ? {
            pdfGeneratedAt: p.pdfGeneratedAt
              ? new Date(p.pdfGeneratedAt)
              : null,
          }
        : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
    };
    const x = await this.inTenant(tenantId, (tx) =>
      tx.dischargeSummaryRecord.updateMany({
        where: { tenantId, id },
        data: d,
      }),
    );
    return x.count ? this.persistedSummaryById(tenantId, id) : null;
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

  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return callback(tx);
    });
  }
  private mapSummary(row: {
    id: string;
    tenantId: string;
    hospitalizationId: string;
    status: string;
    clinicalSummary: string;
    treatments: string | null;
    homeInstructions: string | null;
    medications: Prisma.JsonValue;
    followUpDate: Date | null;
    portalShared: boolean;
    portalSharedAt: Date | null;
    pdfGenerated: boolean;
    pdfGeneratedAt: Date | null;
    finalizedAt: Date | null;
    finalizedBy: string | null;
    amendsSummaryId: string | null;
    amendmentReason: string | null;
    notes: string | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
  }): DischargeSummaryRecord {
    return {
      ...row,
      status: row.status as DischargeSummaryRecord["status"],
      medications: row.medications as DischargeSummaryRecord["medications"],
      followUpDate: row.followUpDate?.toISOString() ?? null,
      portalSharedAt: row.portalSharedAt?.toISOString() ?? null,
      pdfGeneratedAt: row.pdfGeneratedAt?.toISOString() ?? null,
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
