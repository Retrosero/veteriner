/**
 * @file Klinik tüketim (clinical usage) domain tipleri.
 * @module apps/api/common/clinical-usages/clinical-usage.types
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü domain modeli. In-memory Map'te tutulur; production'a
 * geçişte Prisma `ClinicalUsage` + `ClinicalUsageLine` tabloları
 * ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Idempotency:
 * - (tenantId, sourceType, sourceId, idempotencyKey) birleşimi
 *   unique. Aynı key ile ikinci çağrıda mevcut kayıt döner
 *   (409 farklı body ile).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Tüketim kayıtları append-only; fiziksel silme yoktur.
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import type {
  ClinicalUsage,
  ClinicalUsageLine,
  ClinicalUsageSourceType,
} from "@vetniva/contracts";

/** Persist edilmiş tüketim satırı record. */
export interface ClinicalUsageLineRecord {
  id: string;
  tenantId: string;
  usageId: string;
  productId: string;
  unit: string;
  quantity: string;
  lotId: string | null;
  notes: string | null;
  createdAt: string;
}

/** Persist edilmiş tüketim record. */
export interface ClinicalUsageRecord {
  id: string;
  tenantId: string;
  sourceType: ClinicalUsageSourceType;
  sourceId: string;
  idempotencyKey: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

export type { ClinicalUsage, ClinicalUsageLine, ClinicalUsageSourceType };

/** Record → public ClinicalUsage. */
export function toClinicalUsage(rec: ClinicalUsageRecord): ClinicalUsage {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    idempotencyKey: rec.idempotencyKey,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
  };
}

/** Record → public ClinicalUsageLine. */
export function toClinicalUsageLine(
  rec: ClinicalUsageLineRecord,
): ClinicalUsageLine {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    usageId: rec.usageId,
    productId: rec.productId,
    unit: rec.unit,
    quantity: rec.quantity,
    lotId: rec.lotId,
    notes: rec.notes,
    createdAt: rec.createdAt,
  };
}
