/**
 * @file Diagnosis domain tipleri (in-memory).
 * @module apps/api/common/diagnoses/diagnosis.types
 *
 * @description GOAL-043 teşhis ve problem listesi domain modeli.
 * Public tip olan `Diagnosis` (ve enum'lar) `@vetniva/contracts`
 * üzerinden gelir; burada yalnızca repository'nin internal record
 * tipi tutulur (soft-delete `archivedAt` alanı API sözleşmesinde
 * yoktur).
 *
 * İş kuralları:
 * - Teşhis bir `Examination`'a bağlıdır; examinationId üzerinden
 *   tenant izolasyonu yapılır.
 * - Status state machine: `active` → {`resolved`, `chronic`,
 *   `ruled_out`}. `differential` → `ruled_out` (FAZ-4 kuralı).
 * - Soft delete: `archivedAt` set edilir; fiziksel silme yoktur
 *   (klinik kayıt append-only).
 * - ICD-10 vet kodu (`code`) opsiyoneldir, ileride zorunlu hale
 *   gelebilir (FAZ-4+).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Cross-tenant examinationId → 404.
 *
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import type { Diagnosis, DiagnosisCategory, DiagnosisStatus } from "@vetniva/contracts";

/** Repository'nin tuttuğu internal record (archivedAt public tipte yok). */
export interface DiagnosisRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  patientId: string;
  code: string | null;
  name: string;
  category: DiagnosisCategory;
  status: DiagnosisStatus;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  resolvedAt: string | null;
  /** Soft-delete. null = aktif. */
  archivedAt: string | null;
}

/** Record → public Diagnosis (API response). */
export function toDiagnosis(rec: DiagnosisRecord): Diagnosis {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    patientId: rec.patientId,
    code: rec.code,
    name: rec.name,
    category: rec.category,
    status: rec.status,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    resolvedAt: rec.resolvedAt,
  };
}
