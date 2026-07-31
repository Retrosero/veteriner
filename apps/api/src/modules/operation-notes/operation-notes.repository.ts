/**
 * @file OperationNote repository (in-memory).
 * @module apps/api/modules/operation-notes/operation-notes.repository
 *
 * @description GOAL-083 operasyon notu veri erişim katmanı. DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. OperationNote + 2 alt kayıt tipi (team, materials)
 * ayrı Map'lerde tutulur.
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-083 (FAZ-8) operasyon notu ve kullanılan malzemeler core
 */

import { Injectable } from "@nestjs/common";

import type {
  OperationNoteMaterialRecord,
  OperationNoteRecord,
  OperationNoteTeamRecord,
} from "../../common/operation-notes/operation-note.types.js";
import type { OperationNoteStatus } from "@vetniva/contracts";

/** Patch tipi (kısmi güncelleme). */
export interface OperationNotePatch {
  procedure?: string | undefined;
  findings?: string | null | undefined;
  complicationsText?: string | null | undefined;
  technique?: string | null | undefined;
  closureNotes?: string | null | undefined;
  estimatedBloodLoss?: string | null | undefined;
  status?: OperationNoteStatus | undefined;
  finalizedAt?: string | null | undefined;
  finalizedBy?: string | null | undefined;
  amendmentReason?: string | null | undefined;
  amendsNoteId?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface OperationNoteSearchFilters {
  status?: OperationNoteStatus | undefined;
  patientId?: string | undefined;
  surgeryPlanId?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class OperationNotesRepository {
  /** key: id → operation note. */
  private readonly byId = new Map<string, OperationNoteRecord>();
  /** surgeryPlanId → operationNoteId (uniq). */
  private readonly bySurgeryPlanId = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için sub-record id counter. */
  private readonly subCounters = new Map<string, number>();

  /** Alt kayıtlar. */
  private readonly team = new Map<string, OperationNoteTeamRecord>();
  private readonly materials = new Map<string, OperationNoteMaterialRecord>();

  // -------------------------------------------------------------------------
  // ID
  // -------------------------------------------------------------------------

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `op-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextSubId(tenantId: string, prefix: string): string {
    const n = (this.subCounters.get(tenantId) ?? 0) + 1;
    this.subCounters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // OperationNote CRUD
  // -------------------------------------------------------------------------

  public insert(record: OperationNoteRecord): OperationNoteRecord {
    this.byId.set(record.id, record);
    this.bySurgeryPlanId.set(record.surgeryPlanId, record.id);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): OperationNoteRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findBySurgeryPlanId(
    tenantId: string,
    surgeryPlanId: string,
  ): OperationNoteRecord | null {
    const id = this.bySurgeryPlanId.get(surgeryPlanId);
    if (!id) return null;
    return this.findById(tenantId, id);
  }

  public update(
    tenantId: string,
    id: string,
    patch: OperationNotePatch,
  ): OperationNoteRecord | null {
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
    filters: OperationNoteSearchFilters,
  ): { items: OperationNoteRecord[]; total: number } {
    const all: OperationNoteRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId)
        continue;
      if (
        filters.surgeryPlanId &&
        rec.surgeryPlanId !== filters.surgeryPlanId
      )
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

  // -------------------------------------------------------------------------
  // Team
  // -------------------------------------------------------------------------

  public insertTeam(
    rec: OperationNoteTeamRecord,
  ): OperationNoteTeamRecord {
    this.team.set(rec.id, rec);
    return rec;
  }

  public listTeam(
    tenantId: string,
    operationNoteId: string,
  ): OperationNoteTeamRecord[] {
    const out: OperationNoteTeamRecord[] = [];
    for (const rec of this.team.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.operationNoteId !== operationNoteId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Materials
  // -------------------------------------------------------------------------

  public insertMaterial(
    rec: OperationNoteMaterialRecord,
  ): OperationNoteMaterialRecord {
    this.materials.set(rec.id, rec);
    return rec;
  }

  public listMaterials(
    tenantId: string,
    operationNoteId: string,
  ): OperationNoteMaterialRecord[] {
    const out: OperationNoteMaterialRecord[] = [];
    for (const rec of this.materials.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.operationNoteId !== operationNoteId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.usedAt.localeCompare(b.usedAt));
    return out;
  }

  public updateMaterial(
    tenantId: string,
    materialId: string,
    patch: { stockMovementId?: string | null },
  ): OperationNoteMaterialRecord | null {
    const rec = this.materials.get(materialId);
    if (!rec || rec.tenantId !== tenantId) return null;
    if (patch.stockMovementId !== undefined) {
      rec.stockMovementId = patch.stockMovementId;
    }
    this.materials.set(materialId, rec);
    return rec;
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.byId.clear();
    this.bySurgeryPlanId.clear();
    this.counters.clear();
    this.subCounters.clear();
    this.team.clear();
    this.materials.clear();
  }
}
