/**
 * @file Görüntüleme isteği (imaging order) domain tipleri.
 * @module apps/api/common/imaging-orders/imaging-order.types
 *
 * @description GOAL-093 (FAZ-9) görüntüleme isteği domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `ImagingOrder` tablosu ile değiştirilecek (API sözleşmesi sabit
 * kalır).
 *
 * Katalog snapshot'ı (imagingTestCode, imagingTestName, modality,
 * bodyPart, price) order üzerinde dondurulur; katalog sonradan
 * değişse bile order kendi anlık görüntüsünü korur.
 *
 * Rapor alt-akışı: `reportRevisions` dizisinde append-only
 * revizyonlar tutulur. `report` alanı en son revizyonun
 * özetidir (null ise henüz rapor yok). Rapor onaylanmışsa
 * `amendReport` ile yeni revision oluşturulur.
 *
 * Yaşam döngüsü:
 * - `ordered` → `scheduled` → `performed` → `reported` → `completed`
 * - `ordered | scheduled` → `cancelled`
 * - `reported` → `amended` (yeni revision)
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Onaylanmış rapor değiştirilemez; düzeltme `amend` ile yeni
 *   revision olarak yapılır. Portal görünürlüğü `portalVisible`
 *   ile ayrıca kontrol edilir.
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 */

import type {
  ImagingContrastUse,
  ImagingModality,
  ImagingOrder,
  ImagingOrderPriority,
  ImagingOrderSourceType,
  ImagingOrderStatus,
  ImagingReport,
} from "@vetniva/contracts";

/** Persist edilmiş rapor revizyonu. */
export interface ImagingReportRecord {
  revision: number;
  findings: string;
  impression: string;
  recommendation: string | null;
  attachments: string[];
  enteredBy: string;
  enteredAt: string;
  amendmentReason: string | null;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  portalVisible: boolean;
  reviewNotes: string | null;
}

/** Persist edilmiş görüntüleme isteği record. */
export interface ImagingOrderRecord {
  id: string;
  tenantId: string;
  patientId: string;
  imagingTestId: string;
  // Katalog snapshot
  imagingTestCode: string;
  imagingTestName: string;
  modality: ImagingModality;
  bodyPart: string | null;
  price: string;
  sourceType: ImagingOrderSourceType;
  sourceId: string | null;
  priority: ImagingOrderPriority;
  status: ImagingOrderStatus;
  // Planlama
  scheduledAt: string | null;
  scheduledLocation: string | null;
  // Çekim
  performedAt: string | null;
  performedByUserId: string | null;
  contrastUse: ImagingContrastUse | null;
  clinicalInfo: string | null;
  attachments: string[];
  // Rapor
  reportRevisions: ImagingReportRecord[];
  // İptal
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type {
  ImagingContrastUse,
  ImagingModality,
  ImagingOrder,
  ImagingOrderPriority,
  ImagingOrderSourceType,
  ImagingOrderStatus,
  ImagingReport,
};

/** Record → public ImagingReport. */
export function toImagingReport(
  rec: ImagingReportRecord,
): ImagingReport {
  return {
    revision: rec.revision,
    findings: rec.findings,
    impression: rec.impression,
    recommendation: rec.recommendation,
    attachments: [...rec.attachments],
    enteredBy: rec.enteredBy,
    enteredAt: rec.enteredAt,
    amendmentReason: rec.amendmentReason,
    approved: rec.approved,
    approvedBy: rec.approvedBy,
    approvedAt: rec.approvedAt,
    portalVisible: rec.portalVisible,
    reviewNotes: rec.reviewNotes,
  };
}

/** Record → public ImagingOrder. */
export function toImagingOrder(rec: ImagingOrderRecord): ImagingOrder {
  const revisions = rec.reportRevisions.map(toImagingReport);
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    patientId: rec.patientId,
    imagingTestId: rec.imagingTestId,
    imagingTestCode: rec.imagingTestCode,
    imagingTestName: rec.imagingTestName,
    modality: rec.modality,
    bodyPart: rec.bodyPart,
    price: rec.price,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    priority: rec.priority,
    status: rec.status,
    scheduledAt: rec.scheduledAt,
    scheduledLocation: rec.scheduledLocation,
    performedAt: rec.performedAt,
    performedByUserId: rec.performedByUserId,
    contrastUse: rec.contrastUse,
    clinicalInfo: rec.clinicalInfo,
    attachments: [...rec.attachments],
    report:
      revisions.length > 0
        ? (revisions[revisions.length - 1] ?? null)
        : null,
    reportRevisions: revisions,
    cancelledAt: rec.cancelledAt,
    cancelledBy: rec.cancelledBy,
    cancelReason: rec.cancelReason,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}
