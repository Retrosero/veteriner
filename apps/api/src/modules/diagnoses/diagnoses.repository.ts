/**
 * @file Diagnosis (teşhis) repository (in-memory).
 * @module apps/api/modules/diagnoses/diagnoses.repository
 *
 * @description GOAL-043 teşhis kayıt veri erişim katmanı. DB migration
 * sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import { Injectable } from "@nestjs/common";

import type {
  Diagnosis,
  DiagnosisCategory,
  DiagnosisStatus,
} from "@vetniva/contracts";

import {
  toDiagnosis,
  type DiagnosisRecord,
} from "../../common/diagnoses/diagnosis.types.js";

// Re-export internal record tipini module barrel'ı için dışa aç.
export type { DiagnosisRecord };

@Injectable()
export class DiagnosesRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, DiagnosisRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `diag-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: DiagnosisRecord): DiagnosisRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): DiagnosisRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Bir muayeneye bağlı tüm aktif (archivedAt=null) teşhisleri
   * sıralı getirir.
   */
  public findByExaminationId(
    tenantId: string,
    examinationId: string,
  ): DiagnosisRecord[] {
    const out: DiagnosisRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.examinationId !== examinationId) continue;
      if (rec.archivedAt !== null) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
  }

  /**
   * Bir hastanın tüm muayenelerinden teşhisleri toplar. Opsiyonel
   * status filtresi uygulanır. Arşivlenmiş kayıtlar default olarak
   * gizlenir.
   */
  public findByPatientId(
    tenantId: string,
    patientId: string,
    filters: {
      status?: DiagnosisStatus | undefined;
      includeArchived?: boolean | undefined;
    } = {},
  ): DiagnosisRecord[] {
    const out: DiagnosisRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (filters.status && rec.status !== filters.status) continue;
      out.push(rec);
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }

  /**
   * Kısmi güncelleme. `undefined` atlanır; `null` açıkça null yapar.
   * Sadece izin verilen alanlar patch'e kabul edilir.
   */
  public update(
    tenantId: string,
    id: string,
    patch: {
      status?: DiagnosisStatus | undefined;
      category?: DiagnosisCategory | undefined;
      notes?: string | null | undefined;
      code?: string | null | undefined;
      resolvedAt?: string | null | undefined;
      archivedAt?: string | null | undefined;
    },
  ): DiagnosisRecord | null {
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

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  public toRecord(args: DiagnosisRecord): DiagnosisRecord {
    return { ...args };
  }
}

/** Record → public Diagnosis. */
export function toDiagnosisPublic(rec: DiagnosisRecord): Diagnosis {
  return toDiagnosis(rec);
}
