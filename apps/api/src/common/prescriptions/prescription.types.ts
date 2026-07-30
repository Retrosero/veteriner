/**
 * @file Prescription (reçete) domain tipleri.
 * @module apps/api/common/prescriptions/prescription.types
 *
 * @description GOAL-045 reçete domain modeli. Reçete bir
 * (tenant, examination, patient, veterinarian) dörtlüsünün klinik
 * kayıt entity'sidir. Muayeneye foreign key ile bağlanır; muayene
 * üzerinden patient + veterinarian tenant kapsamı zaten doğrulanır.
 *
 * Yaşam döngüsü:
 *   `active` (create) → (`dispensed` | `cancelled` | `expired` |
 *   `completed`). Fiziksel silme YOKTUR; iptal `cancelled` durumu
 *   ile yapılır (append-only klinik kayıt politikası).
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `Prescription` tablosu ile değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Reçete üzerinde fiziksel
 *   silme yoktur.
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import type {
  Prescription,
  PrescriptionCancelInput,
  PrescriptionCreateInput,
  PrescriptionFilters,
  PrescriptionFrequency,
  PrescriptionItem,
  PrescriptionListResponse,
  PrescriptionRoute,
  PrescriptionStatus,
} from "@vetniva/contracts";

/**
 * Persist edilmiş prescription record. API sözleşmesinden (public
 * Prescription) `cancelReason` alanı bu record'da nullable tutulur;
 * iptal sonrası set edilir.
 */
export interface PrescriptionRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  patientId: string;
  veterinarianId: string;
  items: PrescriptionItem[];
  notes: string | null;
  status: PrescriptionStatus;
  prescribedAt: string;
  expiresAt: string;
  dispensedAt: string | null;
  dispensedBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type {
  Prescription,
  PrescriptionCancelInput,
  PrescriptionCreateInput,
  PrescriptionFilters,
  PrescriptionFrequency,
  PrescriptionItem,
  PrescriptionListResponse,
  PrescriptionRoute,
  PrescriptionStatus,
};

/** Record → public Prescription (API response). */
export function toPrescription(rec: PrescriptionRecord): Prescription {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    patientId: rec.patientId,
    veterinarianId: rec.veterinarianId,
    items: rec.items,
    notes: rec.notes,
    status: rec.status,
    prescribedAt: rec.prescribedAt,
    expiresAt: rec.expiresAt,
    dispensedAt: rec.dispensedAt,
    dispensedBy: rec.dispensedBy,
    cancelReason: rec.cancelReason,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}
