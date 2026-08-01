/**
 * @file Controlled Drug Register domain tipleri.
 * @module apps/api/common/controlled-drugs/controlled-drug.types
 * @description GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri
 * için iç domain modeli. API sözleşmesinin (`@vetniva/contracts`)
 * genişletilmiş hâli: `tenantId`, `recordedBy`, `recordedAt`
 * ek olarak tutulur.
 *
 * VETERİNER UYUMU: Misuse of Drugs Regulations 2001 Reg. 19
 * gereği register ciltli, sıralı ve mürekkepli olmalı; sayfa
 * koparma/silme yasak. Bu modül aynı semantiği uygular:
 * - Fiziksel silme YOK (`delete` metodu yok).
 * - Update YOK (tüm alanlar immutable).
 * - Düzeltme: orijinal kayıt korunur, `correction` türünde
 *   yeni bir kayıt eklenir (ters kayıt + düzeltilmiş yeni
 *   kayıt çifti). Append-only.
 *
 * Stok mutabakatı:
 * - `received`, `returned` (in) → +quantity
 * - `dispensed`, `wasted`, `transferred` (out) → -quantity
 * - `count` → etkisiz (sadece kayıt amaçlı; `physicalQuantity`
 *   ve `bookQuantity` ile sapma raporlanır)
 * - `correction` → orijinal kayıtla aynı büyüklükte, ters işaretli.
 *
 * Saklama:
 * - Register: 2 yıl.
 * - Stok kayıtları: 5 yıl.
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Append-only klinik kayıt
 *   politikası uygulanır (fiziksel silme/güncelleme yok).
 * @since GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri core
 */

import type {
  CdEntryType,
  CdRegisterEntry,
  CdSchedule,
  CdUnit,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Persist edilmiş kayıt
 * --------------------------------------------------------------------------
 */

/**
 * Persist edilmiş register kaydı. API sözleşmesinin genişletilmiş
 * hâli: `tenantId`, `recordedBy`, `recordedAt` ek olarak tutulur.
 * Tüm alanlar immutable; düzeltme yalnızca yeni correction entry
 * ile yapılır.
 */
export interface CdRegisterRecord {
  id: string;
  tenantId: string;
  entryType: CdEntryType;
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  /**
   * Stok etkisi (işaretli):
   * - received, returned, transferred (in): pozitif
   * - dispensed, wasted, transferred (out): negatif
   * - count: 0
   * - correction: orijinal kayıtla aynı büyüklükte ters işaretli.
   */
  quantityDelta: number;
  branchId: string;
  storageAreaId: string;
  /** ISO 8601 datetime; kaydın gerçekleştiği an. */
  occurredAt: string;
  /** ISO 8601 datetime; kaydın sisteme girildiği an. */
  recordedAt: string;
  /** Kaydı oluşturan aktör (userId veya "system"). */
  recordedBy: string;
  /** Entry türüne göre değişen opsiyonel alanlar. */
  supplier: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  ownerId: string | null;
  patientId: string | null;
  prescribedByVeterinarianId: string | null;
  prescriptionNumber: string | null;
  emergencyUse: boolean | null;
  reason: string | null;
  witnessUserId: string | null;
  targetBranchId: string | null;
  targetStorageAreaId: string | null;
  transferGroupId: string | null;
  physicalQuantity: number | null;
  bookQuantity: number | null;
  discrepancy: number | null;
  countDate: string | null;
  /** Düzeltme ise hangi kaydı düzeltiyor. */
  correctsEntryId: string | null;
  notes: string | null;
}

/* --------------------------------------------------------------------------
 * Stok durumu
 * --------------------------------------------------------------------------
 */

/** Bir ilaç + şube + saklama alanı için güncel stok durumu. */
export interface CdStockBalance {
  tenantId: string;
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  branchId: string;
  storageAreaId: string;
  /** Received - dispensed - wasted - transferred_out + transferred_in. */
  currentQuantity: number;
  /** Son hareket zamanı (ISO 8601 datetime). */
  lastMovementAt: string | null;
}

/* --------------------------------------------------------------------------
 * Girdi tipleri
 * --------------------------------------------------------------------------
 */

/** Yeni ilaç alımı. */
export interface CdReceiptCreate {
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  quantity: number;
  branchId: string;
  storageAreaId: string;
  supplier: string;
  lotNumber: string;
  /** ISO date YYYY-MM-DD. */
  expiryDate: string;
  /** ISO 8601 datetime. */
  occurredAt?: string;
  notes?: string;
}

/** Hasta/hayvan için kullanım. */
export interface CdDispensingCreate {
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  quantity: number;
  branchId: string;
  storageAreaId: string;
  ownerId?: string;
  patientId?: string;
  emergencyUse?: boolean;
  prescribedByVeterinarianId: string;
  prescriptionNumber: string;
  /** ISO 8601 datetime. */
  occurredAt?: string;
  notes?: string;
}

/** İmha. */
export interface CdWastageCreate {
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  quantity: number;
  branchId: string;
  storageAreaId: string;
  reason:
    "expired" | "damaged" | "recalled" | "spillage" | "contamination" | "other";
  witnessUserId: string;
  /** ISO 8601 datetime. */
  occurredAt?: string;
  notes?: string;
}

/** Sahibine iade. */
export interface CdReturnCreate {
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  quantity: number;
  branchId: string;
  storageAreaId: string;
  ownerId: string;
  patientId?: string;
  reason: string;
  /** ISO 8601 datetime. */
  occurredAt?: string;
}

/** Transfer. */
export interface CdTransferCreate {
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  quantity: number;
  branchId: string;
  storageAreaId: string;
  targetBranchId: string;
  targetStorageAreaId: string;
  transferGroupId: string;
  /** ISO 8601 datetime. */
  occurredAt?: string;
  notes?: string;
}

/** Yıllık fiziksel sayım. */
export interface CdStockCountCreate {
  branchId: string;
  storageAreaId: string;
  drugName: string;
  schedule: CdSchedule;
  unit: CdUnit;
  physicalQuantity: number;
  bookQuantity: number;
  witnessUserId: string;
  /** ISO date YYYY-MM-DD. */
  countDate: string;
  notes?: string;
}

/* --------------------------------------------------------------------------
 * Filtre tipi
 * --------------------------------------------------------------------------
 */

/** Repository'nin iç arama filtresi (Record id bazlı). */
export interface CdRegisterSearchFilters {
  drugName?: string;
  schedule?: CdSchedule;
  entryType?: CdEntryType;
  branchId?: string;
  storageAreaId?: string;
  /** ISO 8601 datetime. */
  from?: string;
  /** ISO 8601 datetime. */
  to?: string;
  limit: number;
  offset: number;
}

/* --------------------------------------------------------------------------
 * Dönüşüm yardımcıları
 * --------------------------------------------------------------------------
 */

/**
 * Record → public CdRegisterEntry (API response).
 * @param rec
 */
export function toCdRegisterEntry(
  rec: CdRegisterRecord,
): Omit<CdRegisterRecord, never> & { tenantId: string } {
  const out: CdRegisterEntry = {
    id: rec.id,
    tenantId: rec.tenantId,
    entryType: rec.entryType,
    drugName: rec.drugName,
    schedule: rec.schedule,
    unit: rec.unit,
    quantityDelta: rec.quantityDelta,
    branchId: rec.branchId,
    storageAreaId: rec.storageAreaId,
    occurredAt: rec.occurredAt,
    recordedAt: rec.recordedAt,
    recordedBy: rec.recordedBy,
    supplier: rec.supplier,
    lotNumber: rec.lotNumber,
    expiryDate: rec.expiryDate,
    ownerId: rec.ownerId,
    patientId: rec.patientId,
    prescribedByVeterinarianId: rec.prescribedByVeterinarianId,
    prescriptionNumber: rec.prescriptionNumber,
    emergencyUse: rec.emergencyUse,
    reason: rec.reason,
    witnessUserId: rec.witnessUserId,
    targetBranchId: rec.targetBranchId,
    targetStorageAreaId: rec.targetStorageAreaId,
    transferGroupId: rec.transferGroupId,
    physicalQuantity: rec.physicalQuantity,
    bookQuantity: rec.bookQuantity,
    discrepancy: rec.discrepancy,
    countDate: rec.countDate,
    correctsEntryId: rec.correctsEntryId,
    notes: rec.notes,
  };
  return out as Omit<CdRegisterRecord, never> & { tenantId: string };
}
