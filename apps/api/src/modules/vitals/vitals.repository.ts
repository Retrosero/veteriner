/**
 * @file Vitals repository (in-memory).
 * @module apps/api/modules/vitals/vitals.repository
 *
 * @description Vital bulguları veri erişim katmanı. GOAL-042
 * kapsamında DB migration sonraya bırakıldı; tenant-scoped
 * in-memory Map kullanılır. Production'a geçişte Prisma
 * repository'si ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

import { Injectable } from "@nestjs/common";

import type { VitalSigns, VitalsRecord } from "@vetniva/contracts";

/** Persist edilmiş vital record. */
export interface VitalsPersistRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  patientId: string;
  veterinarianId: string;
  vitalSigns: VitalSigns;
  takenAt: string;
  recordedBy: string;
}

@Injectable()
export class VitalsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, VitalsPersistRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `vitals-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: VitalsPersistRecord): VitalsPersistRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): VitalsPersistRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Tenant-scoped, examinationId filtresi. `takenAt` desc. */
  public findByExamination(
    tenantId: string,
    examinationId: string,
  ): VitalsPersistRecord[] {
    const out: VitalsPersistRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.examinationId === examinationId) out.push(rec);
    }
    out.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    return out;
  }

  /**
   * Hasta için en yeni vital kaydı (takenAt desc). Bulunamazsa
   * `null`. Cross-tenant → null.
   */
  public latestForPatient(
    tenantId: string,
    patientId: string,
  ): VitalsPersistRecord | null {
    let latest: VitalsPersistRecord | null = null;
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (latest === null || rec.takenAt > latest.takenAt) {
        latest = rec;
      }
    }
    return latest;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}

/** Persist record → public VitalsRecord (API response). */
export function toVitalsRecord(rec: VitalsPersistRecord): VitalsRecord {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    patientId: rec.patientId,
    veterinarianId: rec.veterinarianId,
    vitalSigns: rec.vitalSigns,
    takenAt: rec.takenAt,
    recordedBy: rec.recordedBy,
  };
}
