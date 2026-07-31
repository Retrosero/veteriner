/**
 * @file Laboratuvar isteği (lab order) domain tipleri.
 * @module apps/api/common/lab-orders/lab-order.types
 *
 * @description GOAL-091 (FAZ-9) laboratuvar isteği domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `LabOrder` tablosu ile değiştirilecek (API sözleşmesi sabit
 * kalır).
 *
 * Katalog snapshot'ı (labTestCode, labTestName, sampleType, unit,
 * referenceRange, price) order üzerinde dondurulur; katalog
 * sonradan değişse bile order kendi anlık görüntüsünü korur.
 *
 * Yaşam döngüsü:
 * - `ordered` → `collected` → `processing` → `completed`
 * - `ordered | collected` → `cancelled`
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Fiziksel silme YOKTUR; geri çekme `cancelled` durumuna
 *   geçiş ile yapılır.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 */

import type {
  LabOrder,
  LabOrderPriority,
  LabOrderSampleQuality,
  LabOrderSourceType,
  LabOrderStatus,
} from "@vetniva/contracts";

/** Persist edilmiş lab order record. */
export interface LabOrderRecord {
  id: string;
  tenantId: string;
  patientId: string;
  labTestId: string;
  labTestCode: string;
  labTestName: string;
  sampleType: string;
  unit: string;
  referenceRange: string | null;
  price: string;
  sourceType: LabOrderSourceType;
  sourceId: string | null;
  priority: LabOrderPriority;
  status: LabOrderStatus;
  collectedAt: string | null;
  collectedByUserId: string | null;
  sampleQuality: LabOrderSampleQuality | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type {
  LabOrder,
  LabOrderPriority,
  LabOrderSampleQuality,
  LabOrderSourceType,
  LabOrderStatus,
};

/** Record → public LabOrder. */
export function toLabOrder(rec: LabOrderRecord): LabOrder {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    patientId: rec.patientId,
    labTestId: rec.labTestId,
    labTestCode: rec.labTestCode,
    labTestName: rec.labTestName,
    sampleType: rec.sampleType,
    unit: rec.unit,
    referenceRange: rec.referenceRange,
    price: rec.price,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    priority: rec.priority,
    status: rec.status,
    collectedAt: rec.collectedAt,
    collectedByUserId: rec.collectedByUserId,
    sampleQuality: rec.sampleQuality,
    processingStartedAt: rec.processingStartedAt,
    completedAt: rec.completedAt,
    cancelledAt: rec.cancelledAt,
    cancelledBy: rec.cancelledBy,
    cancelReason: rec.cancelReason,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}
