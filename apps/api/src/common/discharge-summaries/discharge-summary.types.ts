/**
 * @file Gözlem ve taburcu özeti (observation + discharge summary)
 * domain tipleri.
 * @module apps/api/common/discharge-summaries/discharge-summary.types
 *
 * @description GOAL-086 (FAZ-8) domain modeli. In-memory Map'te
 * tutulur; production'a geçişte Prisma ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * 2 varlık:
 * - `ObservationRecord` — append-only gözlem.
 * - `DischargeSummaryRecord` — taburcu özeti (1 yatışa en
 *   fazla 1 draft; final sonrası amendment ile yeni revision).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-086 (FAZ-8) gözlem ve taburcu özeti core
 */

import type {
  DischargeMedicationItem,
  DischargeSummary,
  DischargeSummaryStatus,
  Observation,
  ObservationKind,
} from "@vetniva/contracts";

/** Persist edilmiş gözlem. */
export interface ObservationRecord {
  id: string;
  tenantId: string;
  hospitalizationId: string;
  kind: ObservationKind;
  observedAt: string;
  value: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

/** Persist edilmiş taburcu özeti. */
export interface DischargeSummaryRecord {
  id: string;
  tenantId: string;
  hospitalizationId: string;
  status: DischargeSummaryStatus;
  clinicalSummary: string;
  treatments: string | null;
  homeInstructions: string | null;
  medications: DischargeMedicationItem[];
  followUpDate: string | null;
  portalShared: boolean;
  portalSharedAt: string | null;
  pdfGenerated: boolean;
  pdfGeneratedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  amendsSummaryId: string | null;
  amendmentReason: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type {
  DischargeMedicationItem,
  DischargeSummary,
  DischargeSummaryStatus,
  Observation,
  ObservationKind,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşümler
 * --------------------------------------------------------------------------
 */

export function toObservation(rec: ObservationRecord): Observation {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    hospitalizationId: rec.hospitalizationId,
    kind: rec.kind,
    observedAt: rec.observedAt,
    value: rec.value,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
  };
}

export function toDischargeSummary(
  rec: DischargeSummaryRecord,
): DischargeSummary {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    hospitalizationId: rec.hospitalizationId,
    status: rec.status,
    clinicalSummary: rec.clinicalSummary,
    treatments: rec.treatments,
    homeInstructions: rec.homeInstructions,
    medications: rec.medications,
    followUpDate: rec.followUpDate,
    portalShared: rec.portalShared,
    portalSharedAt: rec.portalSharedAt,
    pdfGenerated: rec.pdfGenerated,
    pdfGeneratedAt: rec.pdfGeneratedAt,
    finalizedAt: rec.finalizedAt,
    finalizedBy: rec.finalizedBy,
    amendsSummaryId: rec.amendsSummaryId,
    amendmentReason: rec.amendmentReason,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}
