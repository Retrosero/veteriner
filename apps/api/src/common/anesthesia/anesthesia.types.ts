/**
 * @file Anestezi takip (anesthesia) domain tipleri.
 * @module apps/api/common/anesthesia/anesthesia.types
 *
 * @description GOAL-082 (FAZ-8) ameliyat içi anestezi takip
 * domain modeli. In-memory Map'te tutulur; production'a geçişte
 * Prisma `AnesthesiaRecord` + alt tablolar ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * Yaşam döngüsü:
 * - `draft`     — alt kayıtlar (ilaç, vital, komplikasyon, personel)
 *   eklenebilir.
 * - `finalized` — append-only; alt kayıt eklenemez.
 *
 * Bir ameliyat planına (surgeryPlanId) bağlı tek bir anestezi
 * kaydı kabul edilir; aynı plan için ikinci anesthesia create
 * isteği reddedilir (409 VET-ANESTHESIA-0004).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Anestezi kaydı üzerinde fiziksel silme YOKTUR; finalize
 *   sonrası tüm alt kayıtlar append-only.
 *
 * @since GOAL-082 (FAZ-8) anestezi takip core
 */

import type {
  Anesthesia,
  AnesthesiaComplication,
  AnesthesiaComplicationSeverity,
  AnesthesiaDetail,
  AnesthesiaMedication,
  AnesthesiaMedicationRoute,
  AnesthesiaStaff,
  AnesthesiaStaffRole,
  AnesthesiaStatus,
  AnesthesiaVital,
  AnesthesiaVitalKind,
} from "@vetniva/contracts";

/** Persist edilmiş anestezi kaydı. */
export interface AnesthesiaRecord {
  id: string;
  tenantId: string;
  surgeryPlanId: string;
  patientId: string;
  protocol: string;
  protocolNotes: string | null;
  status: AnesthesiaStatus;
  inductionAt: string | null;
  recoveryAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** İlaç uygulama kaydı. */
export interface AnesthesiaMedicationRecord {
  id: string;
  tenantId: string;
  anesthesiaId: string;
  medicationName: string;
  dose: string;
  route: AnesthesiaMedicationRoute;
  administeredAt: string;
  administeredByUserId: string;
  notes: string | null;
  createdAt: string;
}

/** Vital bulgu kaydı. */
export interface AnesthesiaVitalRecord {
  id: string;
  tenantId: string;
  anesthesiaId: string;
  kind: AnesthesiaVitalKind;
  value: string;
  unit: string;
  observedAt: string;
  observedByUserId: string;
  notes: string | null;
  createdAt: string;
}

/** Komplikasyon kaydı. */
export interface AnesthesiaComplicationRecord {
  id: string;
  tenantId: string;
  anesthesiaId: string;
  description: string;
  severity: AnesthesiaComplicationSeverity;
  occurredAt: string;
  resolvedAt: string | null;
  reportedByUserId: string;
  action: string | null;
  createdAt: string;
}

/** Personel atama kaydı. */
export interface AnesthesiaStaffRecord {
  id: string;
  tenantId: string;
  anesthesiaId: string;
  userId: string;
  role: AnesthesiaStaffRole;
  assignedAt: string;
  endedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export type {
  Anesthesia,
  AnesthesiaComplication,
  AnesthesiaDetail,
  AnesthesiaMedication,
  AnesthesiaStaff,
  AnesthesiaStatus,
  AnesthesiaVital,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşümler
 * --------------------------------------------------------------------------
 */

export function toAnesthesia(rec: AnesthesiaRecord): Anesthesia {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    surgeryPlanId: rec.surgeryPlanId,
    patientId: rec.patientId,
    protocol: rec.protocol,
    protocolNotes: rec.protocolNotes,
    status: rec.status,
    inductionAt: rec.inductionAt,
    recoveryAt: rec.recoveryAt,
    finalizedAt: rec.finalizedAt,
    finalizedBy: rec.finalizedBy,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

export function toAnesthesiaMedication(
  rec: AnesthesiaMedicationRecord,
): AnesthesiaMedication {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    anesthesiaId: rec.anesthesiaId,
    medicationName: rec.medicationName,
    dose: rec.dose,
    route: rec.route,
    administeredAt: rec.administeredAt,
    administeredByUserId: rec.administeredByUserId,
    notes: rec.notes,
    createdAt: rec.createdAt,
  };
}

export function toAnesthesiaVital(
  rec: AnesthesiaVitalRecord,
): AnesthesiaVital {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    anesthesiaId: rec.anesthesiaId,
    kind: rec.kind,
    value: rec.value,
    unit: rec.unit,
    observedAt: rec.observedAt,
    observedByUserId: rec.observedByUserId,
    notes: rec.notes,
    createdAt: rec.createdAt,
  };
}

export function toAnesthesiaComplication(
  rec: AnesthesiaComplicationRecord,
): AnesthesiaComplication {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    anesthesiaId: rec.anesthesiaId,
    description: rec.description,
    severity: rec.severity,
    occurredAt: rec.occurredAt,
    resolvedAt: rec.resolvedAt,
    reportedByUserId: rec.reportedByUserId,
    action: rec.action,
    createdAt: rec.createdAt,
  };
}

export function toAnesthesiaStaff(
  rec: AnesthesiaStaffRecord,
): AnesthesiaStaff {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    anesthesiaId: rec.anesthesiaId,
    userId: rec.userId,
    role: rec.role,
    assignedAt: rec.assignedAt,
    endedAt: rec.endedAt,
    notes: rec.notes,
    createdAt: rec.createdAt,
  };
}
