/**
 * @file Anesthesia repository (in-memory).
 * @module apps/api/modules/anesthesia/anesthesia.repository
 *
 * @description GOAL-082 anestezi takip veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Anesthesia + 4 alt kayıt tipi (medication, vital,
 * complication, staff) ayrı Map'lerde tutulur.
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-082 (FAZ-8) anestezi takip core
 */

import { Injectable } from "@nestjs/common";

import type {
  AnesthesiaComplicationRecord,
  AnesthesiaMedicationRecord,
  AnesthesiaRecord,
  AnesthesiaStaffRecord,
  AnesthesiaVitalRecord,
} from "../../common/anesthesia/anesthesia.types.js";
import type { AnesthesiaStatus } from "@vetniva/contracts";

/** Patch tipi (kısmi güncelleme). */
export interface AnesthesiaPatch {
  protocol?: string | undefined;
  protocolNotes?: string | null | undefined;
  status?: AnesthesiaStatus | undefined;
  inductionAt?: string | null | undefined;
  recoveryAt?: string | null | undefined;
  finalizedAt?: string | null | undefined;
  finalizedBy?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface AnesthesiaSearchFilters {
  status?: AnesthesiaStatus | undefined;
  patientId?: string | undefined;
  surgeryPlanId?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class AnesthesiaRepository {
  /** key: id → anesthesia. */
  private readonly byId = new Map<string, AnesthesiaRecord>();
  /** surgeryPlanId → anesthesiaId (uniq). */
  private readonly bySurgeryPlanId = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için sub-record id counter. */
  private readonly subCounters = new Map<string, number>();

  /** Alt kayıtlar. */
  private readonly medications = new Map<string, AnesthesiaMedicationRecord>();
  private readonly vitals = new Map<string, AnesthesiaVitalRecord>();
  private readonly complications = new Map<
    string,
    AnesthesiaComplicationRecord
  >();
  private readonly staff = new Map<string, AnesthesiaStaffRecord>();

  // -------------------------------------------------------------------------
  // ID
  // -------------------------------------------------------------------------

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `an-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextSubId(tenantId: string, prefix: string): string {
    const n = (this.subCounters.get(tenantId) ?? 0) + 1;
    this.subCounters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Anesthesia CRUD
  // -------------------------------------------------------------------------

  public insert(record: AnesthesiaRecord): AnesthesiaRecord {
    this.byId.set(record.id, record);
    this.bySurgeryPlanId.set(record.surgeryPlanId, record.id);
    return record;
  }

  public findById(tenantId: string, id: string): AnesthesiaRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findBySurgeryPlanId(
    tenantId: string,
    surgeryPlanId: string,
  ): AnesthesiaRecord | null {
    const id = this.bySurgeryPlanId.get(surgeryPlanId);
    if (!id) return null;
    return this.findById(tenantId, id);
  }

  public update(
    tenantId: string,
    id: string,
    patch: AnesthesiaPatch,
  ): AnesthesiaRecord | null {
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
    filters: AnesthesiaSearchFilters,
  ): { items: AnesthesiaRecord[]; total: number } {
    const all: AnesthesiaRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.surgeryPlanId && rec.surgeryPlanId !== filters.surgeryPlanId)
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
  // Medications
  // -------------------------------------------------------------------------

  public insertMedication(
    rec: AnesthesiaMedicationRecord,
  ): AnesthesiaMedicationRecord {
    this.medications.set(rec.id, rec);
    return rec;
  }

  public listMedications(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaMedicationRecord[] {
    const out: AnesthesiaMedicationRecord[] = [];
    for (const rec of this.medications.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.administeredAt.localeCompare(b.administeredAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Vitals
  // -------------------------------------------------------------------------

  public insertVital(rec: AnesthesiaVitalRecord): AnesthesiaVitalRecord {
    this.vitals.set(rec.id, rec);
    return rec;
  }

  public listVitals(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaVitalRecord[] {
    const out: AnesthesiaVitalRecord[] = [];
    for (const rec of this.vitals.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Complications
  // -------------------------------------------------------------------------

  public insertComplication(
    rec: AnesthesiaComplicationRecord,
  ): AnesthesiaComplicationRecord {
    this.complications.set(rec.id, rec);
    return rec;
  }

  public listComplications(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaComplicationRecord[] {
    const out: AnesthesiaComplicationRecord[] = [];
    for (const rec of this.complications.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  public insertStaff(rec: AnesthesiaStaffRecord): AnesthesiaStaffRecord {
    this.staff.set(rec.id, rec);
    return rec;
  }

  public listStaff(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaStaffRecord[] {
    const out: AnesthesiaStaffRecord[] = [];
    for (const rec of this.staff.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.byId.clear();
    this.bySurgeryPlanId.clear();
    this.counters.clear();
    this.subCounters.clear();
    this.medications.clear();
    this.vitals.clear();
    this.complications.clear();
    this.staff.clear();
  }
}
