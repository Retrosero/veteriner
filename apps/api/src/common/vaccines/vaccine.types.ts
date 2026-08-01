/**
 * @file Vaccine (aşı) domain tipleri.
 * @module apps/api/common/vaccines/vaccine.types
 *
 * @description GOAL-050 aşı protokolü domain modeli. Bir protokol
 * tenant kapsamında, bir türe (species) ve kategoriye (core / non_core
 * / lifestyle / not_recommended) bağlı aşı takvimi tanımlar.
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `VaccineProtocol` tablosu ile değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Protokol üzerinde fiziksel
 *   silme yoktur; arşivleme `archivedAt` alanı ile yapılır (soft
 *   delete, klinik kayıt politikası).
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

import type {
  SpeciesTarget,
  VaccineCategory,
  VaccineDose,
  VaccineProtocol,
  VaccineProtocolStep,
} from "@vetniva/contracts";

/**
 * Persist edilmiş vaccine protocol record. API sözleşmesinden (public
 * VaccineProtocol) `archivedAt` ve `createdBy` ek olarak tutulur.
 * `defaultDose` protokol düzeyinde varsayılan; step'te override yoksa
 * uygulama sırasında kullanılır (bkz. GOAL-051 aşı uygulama kaydı).
 */
export interface VaccineProtocolRecord {
  id: string;
  tenantId: string;
  name: string;
  species: SpeciesTarget;
  category: VaccineCategory;
  manufacturer: string | null;
  defaultDose: VaccineDose | null;
  steps: VaccineProtocolStep[];
  totalDurationMonths: number;
  isCore: boolean;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  archivedAt: string | null;
}

export type {
  SpeciesTarget,
  VaccineCategory,
  VaccineDose,
  VaccineProtocol,
  VaccineProtocolStep,
};

/** Record → public VaccineProtocol (API response). */
export function toVaccineProtocol(rec: VaccineProtocolRecord): VaccineProtocol {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    name: rec.name,
    species: rec.species,
    category: rec.category,
    manufacturer: rec.manufacturer,
    defaultDose: rec.defaultDose,
    steps: rec.steps,
    totalDurationMonths: rec.totalDurationMonths,
    isCore: rec.isCore,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
  };
}

/**
 * Steps listesinden `totalDurationMonths` hesapla.
 * Son step'in `ageWeeks` değeri hafta olarak alınır; 4.345 hafta/ay
 * yaklaşımı ile aya çevrilir ve tavana yuvarlanır (örn. 8 hafta → 2 ay,
 * 52 hafta → 12 ay). Boş liste durumunda 0 döner (service katmanı
 * 422 ile reddeder).
 */
export function computeTotalDurationMonths(
  steps: VaccineProtocolStep[],
): number {
  if (steps.length === 0) return 0;
  const maxWeeks = steps.reduce((m, s) => (s.ageWeeks > m ? s.ageWeeks : m), 0);
  return Math.ceil(maxWeeks / 4.345);
}
