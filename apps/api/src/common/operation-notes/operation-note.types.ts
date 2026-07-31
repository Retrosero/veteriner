/**
 * @file Operasyon notu (operation note) domain tipleri.
 * @module apps/api/common/operation-notes/operation-note.types
 *
 * @description GOAL-083 (FAZ-8) ameliyat operasyon notu domain
 * modeli. In-memory Map'te tutulur; production'a geçişte Prisma
 * `OperationNote` + alt tablolar ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * Yaşam döngüsü:
 * - `draft` → `finalized` | `amended`
 * - `finalized` → `amended` (yeni revision oluşturularak).
 *
 * Bir ameliyat planına (surgeryPlanId) bağlı tek bir operasyon
 * notu kabul edilir; aynı plan için ikinci note create isteği
 * reddedilir (409 VET-OPNOTE-0004).
 *
 * Finalize edildiğinde her material için bir `clinical_use` stock
 * movement oluşturulur (cross-module StockMovementsService ile).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Operasyon notu üzerinde fiziksel silme YOKTUR; düzeltme
 *   amendment ile yapılır.
 *
 * @since GOAL-083 (FAZ-8) operasyon notu ve kullanılan malzemeler core
 */

import type {
  OperationNote,
  OperationNoteDetail,
  OperationNoteMaterial,
  OperationNoteStatus,
  OperationNoteTeam,
  OperationNoteTeamRole,
} from "@vetniva/contracts";

/** Persist edilmiş operasyon notu. */
export interface OperationNoteRecord {
  id: string;
  tenantId: string;
  surgeryPlanId: string;
  patientId: string;
  status: OperationNoteStatus;
  procedure: string;
  findings: string | null;
  complicationsText: string | null;
  technique: string | null;
  closureNotes: string | null;
  estimatedBloodLoss: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  amendsNoteId: string | null;
  amendmentReason: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** Ekip üyesi. */
export interface OperationNoteTeamRecord {
  id: string;
  tenantId: string;
  operationNoteId: string;
  userId: string;
  role: OperationNoteTeamRole;
  assignedAt: string;
  endedAt: string | null;
  notes: string | null;
  createdAt: string;
}

/** Kullanılan malzeme. */
export interface OperationNoteMaterialRecord {
  id: string;
  tenantId: string;
  operationNoteId: string;
  productId: string;
  quantity: string;
  unit: string;
  usedAt: string;
  usedByUserId: string;
  lotId: string | null;
  notes: string | null;
  /** Finalize sonrası oluşturulan stock movement id. */
  stockMovementId: string | null;
  createdAt: string;
}

export type {
  OperationNote,
  OperationNoteDetail,
  OperationNoteMaterial,
  OperationNoteStatus,
  OperationNoteTeam,
  OperationNoteTeamRole,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşümler
 * --------------------------------------------------------------------------
 */

export function toOperationNote(rec: OperationNoteRecord): OperationNote {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    surgeryPlanId: rec.surgeryPlanId,
    patientId: rec.patientId,
    status: rec.status,
    procedure: rec.procedure,
    findings: rec.findings,
    complicationsText: rec.complicationsText,
    technique: rec.technique,
    closureNotes: rec.closureNotes,
    estimatedBloodLoss: rec.estimatedBloodLoss,
    finalizedAt: rec.finalizedAt,
    finalizedBy: rec.finalizedBy,
    amendsNoteId: rec.amendsNoteId,
    amendmentReason: rec.amendmentReason,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

export function toOperationNoteTeam(
  rec: OperationNoteTeamRecord,
): OperationNoteTeam {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    operationNoteId: rec.operationNoteId,
    userId: rec.userId,
    role: rec.role,
    assignedAt: rec.assignedAt,
    endedAt: rec.endedAt,
    notes: rec.notes,
    createdAt: rec.createdAt,
  };
}

export function toOperationNoteMaterial(
  rec: OperationNoteMaterialRecord,
): OperationNoteMaterial {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    operationNoteId: rec.operationNoteId,
    productId: rec.productId,
    quantity: rec.quantity,
    unit: rec.unit,
    usedAt: rec.usedAt,
    usedByUserId: rec.usedByUserId,
    lotId: rec.lotId,
    notes: rec.notes,
    stockMovementId: rec.stockMovementId,
    createdAt: rec.createdAt,
  };
}
