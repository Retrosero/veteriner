/**
 * @file Yatış order ve uygulama kayıtları (hospitalization order)
 * domain tipleri.
 * @module apps/api/common/hospitalization-orders/hospitalization-order.types
 *
 * @description GOAL-085 (FAZ-8) yatış order domain modeli. In-memory
 * Map'te tutulur; production'a geçişte Prisma ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * 2 varlık:
 * - `HospitalizationOrder` — ana order kaydı (tip + talimat +
 *   öncelik + aktiflik aralığı).
 * - `HospitalizationOrderSchedule` — zamanlanmış uygulama kaydı
 *   (pending / applied / skipped).
 *
 * Append-only: iptal `status=cancelled` ile, uygulama
 * `appliedAt` set ile, skip `skippedAt` set ile. Schedule'lar
 * fiziksel olarak silinmez.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import type {
  HospitalizationOrder,
  HospitalizationOrderDetail,
  HospitalizationOrderPriority,
  HospitalizationOrderSchedule,
  HospitalizationOrderStatus,
  HospitalizationOrderType,
} from "@vetniva/contracts";

/** Persist edilmiş order. */
export interface HospitalizationOrderRecord {
  id: string;
  tenantId: string;
  hospitalizationId: string;
  orderType: HospitalizationOrderType;
  instructions: string;
  frequency: string | null;
  priority: HospitalizationOrderPriority;
  status: HospitalizationOrderStatus;
  startsAt: string;
  endsAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** Persist edilmiş zamanlanmış uygulama kaydı. */
export interface HospitalizationOrderScheduleRecord {
  id: string;
  tenantId: string;
  orderId: string;
  scheduledFor: string;
  appliedAt: string | null;
  appliedByUserId: string | null;
  skippedAt: string | null;
  skippedByUserId: string | null;
  skipReason: string | null;
  notes: string | null;
  createdAt: string;
}

export type {
  HospitalizationOrder,
  HospitalizationOrderDetail,
  HospitalizationOrderPriority,
  HospitalizationOrderSchedule,
  HospitalizationOrderStatus,
  HospitalizationOrderType,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşümler
 * --------------------------------------------------------------------------
 */

export function toHospitalizationOrder(
  rec: HospitalizationOrderRecord,
): HospitalizationOrder {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    hospitalizationId: rec.hospitalizationId,
    orderType: rec.orderType,
    instructions: rec.instructions,
    frequency: rec.frequency,
    priority: rec.priority,
    status: rec.status,
    startsAt: rec.startsAt,
    endsAt: rec.endsAt,
    cancelledAt: rec.cancelledAt,
    cancelledBy: rec.cancelledBy,
    cancelReason: rec.cancelReason,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

export function toHospitalizationOrderSchedule(
  rec: HospitalizationOrderScheduleRecord,
): HospitalizationOrderSchedule {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    orderId: rec.orderId,
    scheduledFor: rec.scheduledFor,
    appliedAt: rec.appliedAt,
    appliedByUserId: rec.appliedByUserId,
    skippedAt: rec.skippedAt,
    skippedByUserId: rec.skippedByUserId,
    skipReason: rec.skipReason,
    notes: rec.notes,
    createdAt: rec.createdAt,
  };
}
