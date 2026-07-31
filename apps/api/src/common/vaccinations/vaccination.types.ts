/**
 * @file Vaccination (aşı uygulama kaydı) domain tipleri.
 * @module apps/api/common/vaccinations/vaccination.types
 *
 * @description GOAL-051 aşı uygulama kaydı domain modeli. Bir
 * aşı uygulama kaydı, bir hayvana uygulanan aşının klinik
 * kaydıdır. Hasta + protokol + lot + doz + uygulayan veteriner
 * + tarih + sonraki tarih alanlarından oluşur.
 *
 * İş kuralları (detay service katmanında):
 * - Hasta + protokol aynı tenant'ta mı (cross-tenant → 404).
 * - Lot numarası tenant + protokol kapsamında tekil (duplicate
 *   → 409 VET-VACC-0003).
 * - `nextDueAt`, protokolün bir sonraki adımından türetilir.
 * - Status başlangıçta `administered`; `cancelled` (iptal) ve
 *   `overdue` (türetilmiş) terminalleri vardır. `scheduled`
 *   ileri faz için ayrılmıştır (henüz uygulanmamış ama
 *   planlanmış aşı).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Klinik kayıt üzerinde
 *   fiziksel silme YOKTUR; iptal `cancelled` status ile yapılır.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

/** Aşı uygulama kaydı durumu. */
export type VaccinationStatus =
  | "administered"
  | "scheduled"
  | "cancelled"
  | "overdue";

/**
 * Persist edilmiş aşı uygulama kaydı. API sözleşmesinin (public
 * `Vaccination`) genişletilmiş hâli: `tenantId`, `veterinarianId`,
 * `createdBy`, `createdAt` ek olarak tutulur.
 */
export interface VaccinationRecord {
  id: string;
  tenantId: string;
  patientId: string;
  veterinarianId: string;
  protocolId: string;
  vaccineName: string;
  dose: string;
  lotNumber: string;
  manufacturer: string | null;
  /** ISO 8601 datetime. */
  administeredAt: string;
  /** ISO 8601 datetime; null = tek doz protokol / sonraki yok. */
  nextDueAt: string | null;
  status: VaccinationStatus;
  notes: string | null;
  createdBy: string;
  /** ISO 8601 datetime. */
  createdAt: string;
  /** İptal zamanı; null = aktif. */
  cancelledAt: string | null;
  cancellationReason: string | null;
}

/**
 * Yeni aşı uygulama kaydı oluşturma girdisi. `protocolId` ile
 * protokol tarafı doğrulanır; `vaccineName` / `dose` / `lotNumber`
 * klinik tarafından override edilebilir.
 *
 * `| undefined` ile yazılan opsiyonel alanlar, Zod
 * `.optional()` çıktısıyla bire bir uyumludur
 * (`exactOptionalPropertyTypes: true` uyumu).
 */
export interface VaccinationCreate {
  patientId: string;
  protocolId: string;
  vaccineName: string;
  dose: string;
  lotNumber: string;
  manufacturer?: string | undefined;
  /** ISO 8601 datetime. */
  administeredAt?: string | undefined;
  notes?: string | undefined;
}

/** Tenant-scoped liste filtreleri. */
export interface VaccinationFilters {
  patientId?: string | undefined;
  protocolId?: string | undefined;
  status?: VaccinationStatus | undefined;
  /** ISO 8601 datetime; administeredAt >= from. */
  from?: string | undefined;
  /** ISO 8601 datetime; administeredAt <= to. */
  to?: string | undefined;
}

/** Record → public Vaccination (API response). */
export function toVaccination(
  rec: VaccinationRecord,
): Omit<VaccinationRecord, "tenantId"> & { tenantId: string } {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    patientId: rec.patientId,
    veterinarianId: rec.veterinarianId,
    protocolId: rec.protocolId,
    vaccineName: rec.vaccineName,
    dose: rec.dose,
    lotNumber: rec.lotNumber,
    manufacturer: rec.manufacturer,
    administeredAt: rec.administeredAt,
    nextDueAt: rec.nextDueAt,
    status: rec.status,
    notes: rec.notes,
    createdBy: rec.createdBy,
    createdAt: rec.createdAt,
    cancelledAt: rec.cancelledAt,
    cancellationReason: rec.cancellationReason,
  };
}
