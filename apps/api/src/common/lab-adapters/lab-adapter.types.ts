/**
 * @file Cihaz ve dış laboratuvar adapter domain tipleri.
 * @module apps/api/common/lab-adapters/lab-adapter.types
 *
 * @description GOAL-094 (FAZ-9) adapter sözleşmesi. Provider-agnostic
 *   `LabAdapter` interface + in-memory export/import ledger record
 *   tipleri. Mock implementasyonlar:
 *   - `MockLabDeviceAdapter` (in_clinic_device)
 *   - `MockExternalLabAdapter` (external_lab)
 *
 *   Gerçek provider entegrasyonu Faz 13+ kapsamında; bu modül
 *   sadece interface + mock + ledger sağlar.
 *
 * Yaşam döngüsü (export):
 * - `pending`   → adapter'a gönderildi; provider yanıtı bekleniyor.
 * - `accepted`  → adapter kabul etti; `providerReference` atandı.
 * - `rejected`  → adapter reddetti; `lastError` ile.
 * - `failed`    → retryable hata; operatör retry edebilir.
 * - `cancelled` → operatör iptal etti; tekrar denenemez.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Cross-tenant IDOR → null/404. Idempotency: aynı
 *   `idempotencyKey` ile tekrar export adapter tarafında aynı
 *   yanıtı üretmeli (mock dahil).
 *
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import type {
  LabAdapterExport,
  LabAdapterExportRequest,
  LabAdapterExportResponse,
  LabAdapterExportStatus,
  LabAdapterImport,
  LabAdapterImportResult,
  LabAdapterImportStatus,
  LabAdapterType,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Adapter interface
 * --------------------------------------------------------------------------
 */

/**
 * Lab adapter sözleşmesi. Gerçek provider (Idexx/Heska/Reflab/...)
 * Faz 13+'da bu interface'i implemente eder. Mock implementasyonlar
 * `common/lab-adapters/mock-*.ts` altında.
 *
 * Idempotency:
 * - `exportOrder` aynı `idempotencyKey` ile tekrar çağrıldığında
 *   adapter duplicate kayıt üretmemelidir; mock implementasyon
 *   key'i saklar ve aynı yanıtı döner.
 * - Retry: provider red/fail durumunda operatör
 *   `LabAdaptersService.retryExport` ile aynı `idempotencyKey` ile
 *   tekrar deneyebilir.
 */
export interface LabAdapter {
  /** Adapter türü (in_clinic_device veya external_lab). */
  readonly adapterType: LabAdapterType;
  /** Provider adı (audit/log). */
  readonly providerName: string;
  /**
   * Order'ı provider'a export eder. `pending` durumundaki
   * export'lar için yeni deneme olarak da kullanılabilir (aynı
   * idempotencyKey ile).
   */
  exportOrder(request: LabAdapterExportRequest): Promise<LabAdapterExportResponse>;
  /**
   * Provider'dan gelen sonucu import eder. Mock için aynı
   * providerReference ile çağrıldığında aynı sonucu döner
   * (idempotent).
   */
  importResult(
    request: LabAdapterImportResult,
  ): Promise<LabAdapterImportResult>;
}

/* --------------------------------------------------------------------------
 * Persist record'lar
 * --------------------------------------------------------------------------
 */

/** Persist edilmiş export record. */
export interface LabAdapterExportRecord {
  id: string;
  tenantId: string;
  labOrderId: string;
  adapterType: LabAdapterType;
  providerName: string;
  status: LabAdapterExportStatus;
  idempotencyKey: string;
  providerReference: string | null;
  providerMessage: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  payload: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** Persist edilmiş import record. */
export interface LabAdapterImportRecord {
  id: string;
  tenantId: string;
  labOrderId: string;
  adapterType: LabAdapterType;
  providerName: string;
  status: LabAdapterImportStatus;
  providerReference: string;
  rawPayload: Record<string, unknown>;
  mappedResultId: string | null;
  mappedAt: string | null;
  mappedBy: string | null;
  errorMessage: string | null;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type {
  LabAdapterExport,
  LabAdapterImport,
  LabAdapterExportRequest,
  LabAdapterExportResponse,
  LabAdapterImportResult,
  LabAdapterExportStatus,
  LabAdapterImportStatus,
  LabAdapterType,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşüm
 * --------------------------------------------------------------------------
 */

/** Record → public LabAdapterExport. */
export function toLabAdapterExport(
  rec: LabAdapterExportRecord,
): LabAdapterExport {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    labOrderId: rec.labOrderId,
    adapterType: rec.adapterType,
    providerName: rec.providerName,
    status: rec.status,
    idempotencyKey: rec.idempotencyKey,
    providerReference: rec.providerReference,
    providerMessage: rec.providerMessage,
    attemptCount: rec.attemptCount,
    lastAttemptAt: rec.lastAttemptAt,
    lastError: rec.lastError,
    payload: rec.payload,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

/** Record → public LabAdapterImport. */
export function toLabAdapterImport(
  rec: LabAdapterImportRecord,
): LabAdapterImport {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    labOrderId: rec.labOrderId,
    adapterType: rec.adapterType,
    providerName: rec.providerName,
    status: rec.status,
    providerReference: rec.providerReference,
    rawPayload: rec.rawPayload,
    mappedResultId: rec.mappedResultId,
    mappedAt: rec.mappedAt,
    mappedBy: rec.mappedBy,
    errorMessage: rec.errorMessage,
    receivedAt: rec.receivedAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}
