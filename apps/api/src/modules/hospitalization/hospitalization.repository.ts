/**
 * @file Hospitalization repository (in-memory).
 * @module apps/api/modules/hospitalization/hospitalization.repository
 *
 * @description GOAL-084 yatış + kafes veri erişim katmanı. DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. 3 varlık tipi (cage, hospitalization, cageAssignment)
 * ayrı Map'lerde tutulur.
 *
 * CageAssignment çakışma kontrolü: `findOverlappingAssignment`
 * aynı cageId için [from, to] aralığı çakışan aktif kayıt
 * döner (to=null olanlar "devam eden" sayılır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
 */

import { Injectable } from "@nestjs/common";

import type {
  CageAssignmentRecord,
  CageRecord,
  HospitalizationRecord,
} from "../../common/hospitalization/hospitalization.types.js";
import type { CageKind, HospitalizationStatus } from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Patch tipleri
 * --------------------------------------------------------------------------
 */

export interface CagePatch {
  name?: string | null | undefined;
  kind?: CageKind | undefined;
  capacity?: number | undefined;
  active?: boolean | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

export interface HospitalizationPatch {
  plannedAt?: string | null | undefined;
  admittedAt?: string | null | undefined;
  admittedBy?: string | null | undefined;
  dischargedAt?: string | null | undefined;
  dischargedBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  reason?: string | null | undefined;
  notes?: string | null | undefined;
  status?: HospitalizationStatus | undefined;
  updatedAt?: string | undefined;
}

export interface CageAssignmentPatch {
  to?: string | null | undefined;
  endedBy?: string | null | undefined;
}

/* --------------------------------------------------------------------------
 * Arama filtreleri
 * --------------------------------------------------------------------------
 */

export interface HospitalizationSearchFilters {
  status?: HospitalizationStatus | undefined;
  patientId?: string | undefined;
  activeOnly?: boolean | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

export interface CageSearchFilters {
  kind?: CageKind | undefined;
  active?: boolean | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class HospitalizationRepository {
  // -------------------------------------------------------------------------
  // Counter'lar
  // -------------------------------------------------------------------------

  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string, prefix: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Cage
  // -------------------------------------------------------------------------

  private readonly cages = new Map<string, CageRecord>();
  private readonly cageByCode = new Map<string, string>(); // `${tenantId}::${code}` → id

  public insertCage(rec: CageRecord): CageRecord {
    this.cages.set(rec.id, rec);
    this.cageByCode.set(`${rec.tenantId}::${rec.code}`, rec.id);
    return rec;
  }

  public findCageById(tenantId: string, id: string): CageRecord | null {
    const rec = this.cages.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findCageByCode(tenantId: string, code: string): CageRecord | null {
    const id = this.cageByCode.get(`${tenantId}::${code}`);
    if (!id) return null;
    return this.findCageById(tenantId, id);
  }

  public updateCage(
    tenantId: string,
    id: string,
    patch: CagePatch,
  ): CageRecord | null {
    const rec = this.findCageById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.cages.set(id, rec);
    return rec;
  }

  public searchCages(
    tenantId: string,
    filters: CageSearchFilters,
  ): { items: CageRecord[]; total: number } {
    const all: CageRecord[] = [];
    for (const rec of this.cages.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.kind && rec.kind !== filters.kind) continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      all.push(rec);
    }
    const sort = filters.sort ?? "asc";
    all.sort((a, b) => {
      const cmp = a.code.localeCompare(b.code);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // Hospitalization
  // -------------------------------------------------------------------------

  private readonly hospitalizations = new Map<string, HospitalizationRecord>();
  /** patientId → active hospitalizationId (status in
   * {planned, admitted, active}). Tenant-scoped key. */
  private readonly activeByPatient = new Map<string, string>();

  public insertHospitalization(
    rec: HospitalizationRecord,
  ): HospitalizationRecord {
    this.hospitalizations.set(rec.id, rec);
    if (
      rec.status === "planned" ||
      rec.status === "admitted" ||
      rec.status === "active"
    ) {
      this.activeByPatient.set(`${rec.tenantId}::${rec.patientId}`, rec.id);
    }
    return rec;
  }

  public findHospitalizationById(
    tenantId: string,
    id: string,
  ): HospitalizationRecord | null {
    const rec = this.hospitalizations.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findActiveByPatient(
    tenantId: string,
    patientId: string,
  ): HospitalizationRecord | null {
    const id = this.activeByPatient.get(`${tenantId}::${patientId}`);
    if (!id) return null;
    return this.findHospitalizationById(tenantId, id);
  }

  public updateHospitalization(
    tenantId: string,
    id: string,
    patch: HospitalizationPatch,
  ): HospitalizationRecord | null {
    const rec = this.findHospitalizationById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    // Active index güncelle.
    const key = `${rec.tenantId}::${rec.patientId}`;
    if (
      rec.status === "planned" ||
      rec.status === "admitted" ||
      rec.status === "active"
    ) {
      this.activeByPatient.set(key, rec.id);
    } else {
      // discharged veya cancelled → indexten çıkar.
      const cur = this.activeByPatient.get(key);
      if (cur === rec.id) this.activeByPatient.delete(key);
    }
    this.hospitalizations.set(id, rec);
    return rec;
  }

  public searchHospitalizations(
    tenantId: string,
    filters: HospitalizationSearchFilters,
  ): { items: HospitalizationRecord[]; total: number } {
    const all: HospitalizationRecord[] = [];
    for (const rec of this.hospitalizations.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.activeOnly) {
        if (
          rec.status !== "planned" &&
          rec.status !== "admitted" &&
          rec.status !== "active"
        ) {
          continue;
        }
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

  // -------------------------------------------------------------------------
  // CageAssignment
  // -------------------------------------------------------------------------

  private readonly cageAssignments = new Map<string, CageAssignmentRecord>();

  public insertCageAssignment(rec: CageAssignmentRecord): CageAssignmentRecord {
    this.cageAssignments.set(rec.id, rec);
    return rec;
  }

  public findCageAssignmentById(
    tenantId: string,
    id: string,
  ): CageAssignmentRecord | null {
    const rec = this.cageAssignments.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateCageAssignment(
    tenantId: string,
    id: string,
    patch: CageAssignmentPatch,
  ): CageAssignmentRecord | null {
    const rec = this.findCageAssignmentById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.cageAssignments.set(id, rec);
    return rec;
  }

  public listCageAssignments(
    tenantId: string,
    hospitalizationId: string,
  ): CageAssignmentRecord[] {
    const out: CageAssignmentRecord[] = [];
    for (const rec of this.cageAssignments.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.hospitalizationId !== hospitalizationId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.from.localeCompare(b.from));
    return out;
  }

  /**
   * Aynı `cageId` için `excludeAssignmentId` dışında, yeni
   * atama `[from, to]` aralığıyla çakışan aktif (to=null veya
   * tarih aralığı kesişen) kayıtları döner.
   *
   * Çakışma: mevcut kaydın (e.from <= new.to) VE
   *           (e.to == null VEYA e.to >= new.from).
   * to=null olan kayıt "açık" sayılır (devam eden atama).
   */
  public findOverlappingAssignment(
    tenantId: string,
    cageId: string,
    from: string,
    to: string | null,
    excludeAssignmentId: string | null,
  ): CageAssignmentRecord | null {
    for (const rec of this.cageAssignments.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.cageId !== cageId) continue;
      if (excludeAssignmentId && rec.id === excludeAssignmentId) continue;
      const eFrom = rec.from;
      const eTo = rec.to;
      // new.from < e.to (veya e.to null) VE new.to > e.from
      if (from < eFrom) continue; // new starts before existing start — but overlap depends
      // yeni interval [from, to], mevcut [eFrom, eTo]
      // overlap: from <= eTo AND to >= eFrom (to=null → açık)
      const eToResolved = eTo ?? "9999-12-31T23:59:59.999Z";
      if (from <= eToResolved && (to ?? "9999-12-31T23:59:59.999Z") >= eFrom) {
        return rec;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.counters.clear();
    this.cages.clear();
    this.cageByCode.clear();
    this.hospitalizations.clear();
    this.activeByPatient.clear();
    this.cageAssignments.clear();
  }
}
