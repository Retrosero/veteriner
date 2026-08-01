/**
 * @file Ameliyat planı (surgery plan) domain tipleri.
 * @module apps/api/common/surgery-plans/surgery-plan.types
 *
 * @description GOAL-080 (FAZ-8) ameliyat planı domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `SurgeryPlan` tablosu ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * Yaşam döngüsü:
 * - `scheduled` → `in_progress` → `completed` | `cancelled`
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Ameliyat planı üzerinde fiziksel silme yoktur; iptal
 *   `cancelled` durumuna geçiş ile yapılır.
 *
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
 */

import type { SurgeryPlan, SurgeryPlanStatus } from "@vetniva/contracts";

/** Persist edilmiş plan record. */
export interface SurgeryPlanRecord {
  id: string;
  tenantId: string;
  patientId: string;
  leadSurgeonUserId: string;
  operationType: string;
  scheduledAt: string;
  appointmentId: string | null;
  status: SurgeryPlanStatus;
  notes: string | null;
  startedAt: string | null;
  startedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type { SurgeryPlan, SurgeryPlanStatus };

/** Record → public SurgeryPlan. */
export function toSurgeryPlan(rec: SurgeryPlanRecord): SurgeryPlan {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    patientId: rec.patientId,
    leadSurgeonUserId: rec.leadSurgeonUserId,
    operationType: rec.operationType,
    scheduledAt: rec.scheduledAt,
    appointmentId: rec.appointmentId,
    status: rec.status,
    notes: rec.notes,
    startedAt: rec.startedAt,
    startedBy: rec.startedBy,
    completedAt: rec.completedAt,
    completedBy: rec.completedBy,
    cancelledAt: rec.cancelledAt,
    cancelledBy: rec.cancelledBy,
    cancelReason: rec.cancelReason,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}
