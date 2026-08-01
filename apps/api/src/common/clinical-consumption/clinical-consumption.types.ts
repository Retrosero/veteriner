/**
 * @file Klinik tüketim (ClinicalConsumption) domain tipleri.
 * @module apps/api/common/clinical-consumption/clinical-consumption.types
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü domain modeli. Klinik tüketim kaydı, bir klinik olay
 * (muayene/aşı/ameliyat/yatış/reçete) sırasında kullanılan ürünlerin
 * listesini tutar. Stok düşümü `StockMovementsService` üzerinden
 * `type='clinical_use'` (veya `type='vaccination'`) hareketi ile
 * yapılır; bu record oluşturulan stok hareketlerinin ID'lerini
 * saklar.
 *
 * **Yaşam döngüsü:**
 *   `recorded` (create) → (`cancelled` iptal sonrası).
 *   İptal durumunda her satır için ters kayıt (`type='reversal'`)
 *   oluşturulur; stok geri gelir. Fiziksel silme YOKTUR.
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `ClinicalConsumption` tablosu ile değiştirilecek (API sözleşmesi
 * sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Tüketim kayıtları üzerinde
 *   fiziksel silme yoktur; iptal yalnızca ters kayıt ile.
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import type {
  ClinicalConsumption,
  ClinicalConsumptionContext,
  ClinicalConsumptionLine,
  ClinicalConsumptionStatus,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Persist edilmiş record
 * -------------------------------------------------------------------------- */

/**
 * Klinik tüketim kaydı record. Public `ClinicalConsumption` sözleşmesi
 * ile aynı alanlar; ek olarak iptal bilgisi ve tenant izolasyonu
 * metadata'sı.
 *
 * - `stockMovementIds` her satır için oluşturulan stok hareket
 *   ID'lerini taşır (lines ile paralel). İptal anında bu hareketler
 *   tersine çevrilir.
 */
export interface ClinicalConsumptionRecord {
  id: string;
  tenantId: string;
  context: ClinicalConsumptionContext;
  contextRefId: string;
  patientId: string | null;
  lines: ClinicalConsumptionLine[];
  notes: string | null;
  status: ClinicalConsumptionStatus;
  occurredAt: string;
  createdAt: string;
  createdBy: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  /** Satır başına oluşturulan stok hareket ID'leri (lines ile aynı sıra). */
  stockMovementIds: string[];
}

export type {
  ClinicalConsumption,
  ClinicalConsumptionContext,
  ClinicalConsumptionLine,
  ClinicalConsumptionStatus,
};

/** Record → public ClinicalConsumption (API response). */
export function toClinicalConsumption(
  rec: ClinicalConsumptionRecord,
): ClinicalConsumption {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    context: rec.context,
    contextRefId: rec.contextRefId,
    patientId: rec.patientId,
    lines: rec.lines,
    notes: rec.notes,
    status: rec.status,
    occurredAt: rec.occurredAt,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    cancelledAt: rec.cancelledAt,
    cancelledBy: rec.cancelledBy,
    cancelReason: rec.cancelReason,
    stockMovementIds: rec.stockMovementIds,
  };
}

/* --------------------------------------------------------------------------
 * Quantity yardımcısı (satır miktarı normalize)
 * -------------------------------------------------------------------------- */

/**
 * Tüketim satırındaki pozitif miktarı normalize et (ürün/lot/stock
 * modülü ile uyumlu). 4 ondalık basamağa kadar desteklenir. Geçersiz
 * format → null.
 *
 * Stok hareketine yazılırken servis negatif işaret ekler; burada
 * yalnızca pozitif miktar doğrulanır.
 */
export function normalizeConsumptionQuantity(value: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  if (value === "0" || value === "0.0") return null;
  const parts = value.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = parts[1];
  const normalizedInt =
    intPart.length > 1 ? intPart.replace(/^0+(?=\d)/, "") : intPart;
  if (
    normalizedInt === "0" &&
    (fracPart === undefined || /^0+$/.test(fracPart))
  ) {
    return null;
  }
  return fracPart !== undefined
    ? `${normalizedInt}.${fracPart}`
    : normalizedInt;
}

/* --------------------------------------------------------------------------
 * Domain kuralları
 * -------------------------------------------------------------------------- */

/**
 * `vaccination` bağlamı için lot zorunlu mu? Stok aşı uygulamasında
 * hangi lot'tan çıkıldığının bilinmesi SKT izleme ve geri çekme
 * (recall) için zorunludur.
 */
export function isLotRequiredForContext(
  context: ClinicalConsumptionContext,
): boolean {
  return context === "vaccination";
}

/**
 * Tüketim satırında `lotId` zorunlu olan context'lerde yoksa
 * false. Servis katmanı bu kontrolü `create` anında yapar.
 */
export function validateLineForContext(
  context: ClinicalConsumptionContext,
  line: ClinicalConsumptionLine,
): boolean {
  if (isLotRequiredForContext(context) && !line.lotId) {
    return false;
  }
  return true;
}
