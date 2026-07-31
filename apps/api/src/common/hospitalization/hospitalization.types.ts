/**
 * @file Yatış ve kafes yönetimi (hospitalization) domain tipleri.
 * @module apps/api/common/hospitalization/hospitalization.types
 *
 * @description GOAL-084 (FAZ-8) yatış domain modeli. In-memory
 * Map'te tutulur; production'a geçişte Prisma ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * Varlıklar:
 * - `Cage` — kafes.
 * - `Hospitalization` — yatış.
 * - `CageAssignment` — kafes ataması (append-only zaman aralığı).
 *
 * Zaman çakışması: aynı `cageId` için açık (to=null) veya
 * aralıkları çakışan iki `CageAssignment` olamaz. Service
 * katmanı `repo.findOverlappingAssignment` ile kontrol eder.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Yatış/kafes üzerinde fiziksel silme YOKTUR; iptal
 *   `cancelled` durumuna geçiş ile yapılır.
 *
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
 */

import type {
  Cage,
  CageAssignment,
  CageKind,
  Hospitalization,
  HospitalizationDetail,
  HospitalizationStatus,
} from "@vetniva/contracts";

/** Persist edilmiş kafes. */
export interface CageRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string | null;
  kind: CageKind;
  capacity: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** Persist edilmiş yatış. */
export interface HospitalizationRecord {
  id: string;
  tenantId: string;
  patientId: string;
  status: HospitalizationStatus;
  plannedAt: string | null;
  admittedAt: string | null;
  admittedBy: string | null;
  dischargedAt: string | null;
  dischargedBy: string | null;
  cancelReason: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** Persist edilmiş kafes ataması. */
export interface CageAssignmentRecord {
  id: string;
  tenantId: string;
  hospitalizationId: string;
  cageId: string;
  from: string;
  to: string | null;
  endedBy: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

export type {
  Cage,
  CageAssignment,
  CageKind,
  Hospitalization,
  HospitalizationDetail,
  HospitalizationStatus,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşümler
 * --------------------------------------------------------------------------
 */

export function toCage(rec: CageRecord): Cage {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    code: rec.code,
    name: rec.name,
    kind: rec.kind,
    capacity: rec.capacity,
    active: rec.active,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

export function toHospitalization(
  rec: HospitalizationRecord,
): Hospitalization {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    patientId: rec.patientId,
    status: rec.status,
    plannedAt: rec.plannedAt,
    admittedAt: rec.admittedAt,
    admittedBy: rec.admittedBy,
    dischargedAt: rec.dischargedAt,
    dischargedBy: rec.dischargedBy,
    cancelReason: rec.cancelReason,
    reason: rec.reason,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

export function toCageAssignment(
  rec: CageAssignmentRecord,
): CageAssignment {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    hospitalizationId: rec.hospitalizationId,
    cageId: rec.cageId,
    from: rec.from,
    to: rec.to,
    endedBy: rec.endedBy,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
  };
}
