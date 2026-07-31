/**
 * @file Laboratuvar test kataloğu (lab test) domain tipleri.
 * @module apps/api/common/lab-tests/lab-test.types
 *
 * @description GOAL-090 (FAZ-9) tenant bazlı laboratuvar test
 * kataloğu domain modeli. In-memory Map'te tutulur; production'a
 * geçişte Prisma `LabTest` tablosu ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * Yaşam döngüsü:
 * - Tek statü: `active=true | false` (arşiv için false).
 * - Fiziksel silme YOKTUR.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   `code` tenant-scoped unique. Fiyat `string` (4 ondalık).
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 */

import type {
  LabConditionAxis,
  LabSampleType,
  LabTest,
} from "@vetniva/contracts";

/** Persist edilmiş lab test record. */
export interface LabTestRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  sampleType: LabSampleType;
  unit: string;
  referenceRange: string | null;
  conditionalRanges: string | null;
  price: string;
  active: boolean;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type { LabConditionAxis, LabSampleType, LabTest };

/** Record → public LabTest. */
export function toLabTest(rec: LabTestRecord): LabTest {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    code: rec.code,
    name: rec.name,
    sampleType: rec.sampleType,
    unit: rec.unit,
    referenceRange: rec.referenceRange,
    conditionalRanges: rec.conditionalRanges,
    price: rec.price,
    active: rec.active,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}
