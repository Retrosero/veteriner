/**
 * @file Vaccine application (aşı uygulama) domain tipleri.
 * @module apps/api/common/vaccines/vaccine-application.types
 *
 * @description GOAL-051 aşı uygulama kaydı domain modeli. Bir
 * uygulama kaydı tenant kapsamında, bir hayvana (patient) ve bir
 * aşı protokolüne (vaccine protocol) bağlıdır. Uygulama anında
 * stok düşümü aynı işlemde yapılır (aşı kaydı + stok hareketi
 * atomik).
 *
 * Düzeltme/iptal politikası:
 * - Fiziksel silme yoktur.
 * - Hatalı uygulama `amend` ile düzeltilir; status='amended' +
 *   `amendedAt`/`amendedBy` set edilir.
 * - Tamamen iptal `cancel` ile yapılır; status='cancelled' +
 *   stok düşümü ters kayıt (reverse movement) ile geri alınır.
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `VaccineApplication` + `StockMovement` tabloları ile
 * değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import type {
  VaccineApplication,
  VaccineApplicationStatus,
  VaccineDose,
  VaccineLotInfo,
} from "@vetniva/contracts";

/**
 * Persist edilmiş aşı uygulama kaydı. API sözleşmesinden (public
 * VaccineApplication) farkı: status tipi + dahili alanlar (createdBy
 * null olabilir, system üzerinden de kayıt açılabilir).
 *
 * GOAL-054 amendment:
 * - `amendedReason` — son amendment gerekçesi (audit için).
 * - Eski kayıt korunur (status='amended' set edilir, önceki alan
 *   değerleri audit log'a yazılır; fiziksel silme yok).
 */
export interface VaccineApplicationRecord {
  id: string;
  tenantId: string;
  patientId: string;
  protocolId: string;
  lot: VaccineLotInfo;
  dose: VaccineDose | null;
  administeredBy: string;
  applicationDate: string;
  nextDueDate: string | null;
  notes: string | null;
  status: VaccineApplicationStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  amendedAt: string | null;
  amendedBy: string | null;
  /** GOAL-054: amendment gerekçesi. */
  amendedReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** Bu uygulamaya bağlı stok hareket(ler)i ID listesi. */
  stockMovementIds: string[];
}

/** Record → public VaccineApplication (API response). */
export function toVaccineApplication(
  rec: VaccineApplicationRecord,
): VaccineApplication {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    patientId: rec.patientId,
    protocolId: rec.protocolId,
    lot: rec.lot,
    dose: rec.dose,
    administeredBy: rec.administeredBy,
    applicationDate: rec.applicationDate,
    nextDueDate: rec.nextDueDate,
    notes: rec.notes,
    status: rec.status,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    amendedAt: rec.amendedAt,
    amendedBy: rec.amendedBy,
    amendedReason: rec.amendedReason,
    cancelledAt: rec.cancelledAt,
    cancellationReason: rec.cancellationReason,
    stockMovementIds: [...rec.stockMovementIds],
  };
}

/**
 * Aşı uygulaması için doz çözümleme. Öncelik sırası:
 * 1) Uygulama isteğindeki `dose` (klinik override).
 * 2) Protokolün `defaultDose`'u.
 * 3) `null` (serbest metin / klinik karar).
 */
export function resolveApplicationDose(
  requested: VaccineDose | undefined,
  protocolDefault: VaccineDose | null,
): VaccineDose | null {
  if (requested) return requested;
  return protocolDefault;
}

/**
 * SKT kontrolü. SKT, bugünden (UTC) ÖNCE ise lot süresi dolmuş
 * sayılır. Bugünün tarihi (UTC) ile karşılaştırılır.
 */
export function isLotExpired(
  expiryDate: string,
  referenceIso: string = new Date().toISOString(),
): boolean {
  // expiryDate: YYYY-MM-DD; referenceIso: ISO 8601 datetime
  const expiry = new Date(`${expiryDate}T00:00:00.000Z`).getTime();
  const ref = new Date(referenceIso).getTime();
  if (Number.isNaN(expiry) || Number.isNaN(ref)) return true;
  return expiry < ref;
}
