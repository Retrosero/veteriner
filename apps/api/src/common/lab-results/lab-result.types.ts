/**
 * @file Laboratuvar sonucu (lab result) domain tipleri.
 * @module apps/api/common/lab-results/lab-result.types
 *
 * @description GOAL-092 (FAZ-9) laboratuvar sonucu domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `LabResult` tablosu ile değiştirilecek (API sözleşmesi sabit
 * kalır).
 *
 * Bir lab order için tek bir sonuç; her amendment yeni bir
 * `revision` numarasıyla yeni kayıt oluşturur. Eski revizyon
 * `amended` işaretlenir.
 *
 * Yaşam döngüsü:
 * - `draft` → `pending_review` → `approved` (finalize)
 * - `approved` → `amended` (yeni revision oluşur)
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Onaylanmış (approved) sonuç değiştirilemez; düzeltme
 *   `amend` ile yeni revision olarak yapılır.
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 */

import type {
  LabAbnormalFlag,
  LabResult,
  LabResultRevision,
  LabResultStatus,
} from "@vetniva/contracts";

/** Persist edilmiş lab sonucu record. */
export interface LabResultRecord {
  id: string;
  tenantId: string;
  labOrderId: string;
  revision: number;
  value: string;
  valueNumeric: string | null;
  unit: string;
  referenceRange: string | null;
  abnormalFlag: LabAbnormalFlag;
  status: LabResultStatus;
  attachments: string[];
  notes: string | null;
  enteredBy: string;
  enteredAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  amendsResultId: string | null;
  amendmentReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type { LabAbnormalFlag, LabResult, LabResultRevision, LabResultStatus };

/** Record → public LabResult. */
export function toLabResult(rec: LabResultRecord): LabResult {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    labOrderId: rec.labOrderId,
    revision: rec.revision,
    value: rec.value,
    valueNumeric: rec.valueNumeric,
    unit: rec.unit,
    referenceRange: rec.referenceRange,
    abnormalFlag: rec.abnormalFlag,
    status: rec.status,
    attachments: rec.attachments,
    notes: rec.notes,
    enteredBy: rec.enteredBy,
    enteredAt: rec.enteredAt,
    reviewedBy: rec.reviewedBy,
    reviewedAt: rec.reviewedAt,
    reviewNotes: rec.reviewNotes,
    amendsResultId: rec.amendsResultId,
    amendmentReason: rec.amendmentReason,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/** Record → public LabResultRevision. */
export function toLabResultRevision(rec: LabResultRecord): LabResultRevision {
  return {
    id: rec.id,
    revision: rec.revision,
    status: rec.status,
    enteredBy: rec.enteredBy,
    enteredAt: rec.enteredAt,
    reviewedBy: rec.reviewedBy,
    reviewedAt: rec.reviewedAt,
    amendmentReason: rec.amendmentReason,
  };
}
