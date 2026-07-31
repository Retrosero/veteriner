/**
 * @file Onam formu (consent) domain tipleri.
 * @module apps/api/common/consents/consent.types
 *
 * @description GOAL-081 (FAZ-8) onam formu domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `ConsentForm` tablosu ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * Yaşam döngüsü:
 * - `draft` → `signed` | `revoked`
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Onam formu üzerinde fiziksel silme yoktur; geri çekme
 *   `revoked` durumuna geçiş ile yapılır.
 *
 * @since GOAL-081 (FAZ-8) onam formları core
 */

import type {
  Consent,
  ConsentSignatureMethod,
  ConsentStatus,
  ConsentTemplateType,
} from "@vetniva/contracts";

/** Persist edilmiş onam formu record. */
export interface ConsentRecord {
  id: string;
  tenantId: string;
  templateType: ConsentTemplateType;
  templateVersion: string;
  patientId: string;
  ownerId: string;
  sourceType: string | null;
  sourceId: string | null;
  locale: string;
  status: ConsentStatus;
  signatureMethod: ConsentSignatureMethod | null;
  signatureProvider: string | null;
  signatureReference: string | null;
  signedAt: string | null;
  notes: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type {
  Consent,
  ConsentSignatureMethod,
  ConsentStatus,
  ConsentTemplateType,
};

/** Record → public Consent. */
export function toConsent(rec: ConsentRecord): Consent {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    templateType: rec.templateType,
    templateVersion: rec.templateVersion,
    patientId: rec.patientId,
    ownerId: rec.ownerId,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    locale: rec.locale,
    status: rec.status,
    signatureMethod: rec.signatureMethod,
    signatureProvider: rec.signatureProvider,
    signatureReference: rec.signatureReference,
    signedAt: rec.signedAt,
    notes: rec.notes,
    revokedAt: rec.revokedAt,
    revokedBy: rec.revokedBy,
    revokeReason: rec.revokeReason,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}
