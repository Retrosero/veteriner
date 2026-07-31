/**
 * @file e-SMM domain tipleri ve adapter sözleşmesi.
 * @module apps/api/common/esmm/esmm.types
 *
 * @description GOAL-077 (FAZ-7) e-SMM provider adapter
 * sözleşmesi. Provider-agnostic interface + mock provider
 * implementasyonu. Gerçek GİB/özel provider entegrasyonu Faz
 * 13+ kapsamında.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Belgeler üzerinde fiziksel silme yoktur; `status` alanı
 *   ile yaşam döngüsü takip edilir.
 *
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import type {
  EsmmDocument,
  EsmmDocumentStatus,
  EsmmDocumentType,
  EsmmSubmitRequest,
  EsmmSubmitResponse,
} from "@vetniva/contracts";

/** Persist edilmiş belge record. */
export interface EsmmDocumentRecord {
  id: string;
  tenantId: string;
  type: EsmmDocumentType;
  sourceType: "clinic_sale" | "petshop_sale";
  sourceId: string;
  status: EsmmDocumentStatus;
  providerDocumentId: string | null;
  providerDocumentNumber: string | null;
  providerMessage: string | null;
  /** Serbest JSON payload (provider'a gönderilecek). */
  payload: Record<string, unknown>;
  manualDocumentNumber: string | null;
  notes: string | null;
  lastAttemptAt: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type {
  EsmmDocument,
  EsmmDocumentStatus,
  EsmmDocumentType,
  EsmmSubmitRequest,
  EsmmSubmitResponse,
};

/** Record → public EsmmDocument. */
export function toEsmmDocument(rec: EsmmDocumentRecord): EsmmDocument {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    type: rec.type,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    status: rec.status,
    providerDocumentId: rec.providerDocumentId,
    providerDocumentNumber: rec.providerDocumentNumber,
    providerMessage: rec.providerMessage,
    payload: rec.payload,
    manualDocumentNumber: rec.manualDocumentNumber,
    notes: rec.notes,
    lastAttemptAt: rec.lastAttemptAt,
    acceptedAt: rec.acceptedAt,
    cancelledAt: rec.cancelledAt,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

/* --------------------------------------------------------------------------
 * Adapter interface
 * -------------------------------------------------------------------------- */

/**
 * e-SMM provider adapter sözleşmesi. Bu interface'i gerçek
 * provider (GİB/enfitek/Logo/...) implemente eder. MVP
 * kapsamında `MockEsmmAdapter` no-op mock olarak kullanılır.
 *
 * Retry/idempotency:
 * - `submitDocument` aynı `idempotencyKey` ile tekrar çağrıldığında
 *   provider duplicate belge üretmemelidir. Mock implementasyon
 *   key'i saklar ve aynı yanıtı döner.
 * - Retry: provider red/fail durumunda operatör
 *   `EsmmService.retryDocument` ile aynı `idempotencyKey` ile
 *   tekrar deneyebilir.
 */
export interface EsmmAdapter {
  /** Adapter provider adı (audit/log). */
  readonly providerName: string;
  /**
   * Belgeyi provider'a gönderir. `pending` durumundaki belgeler
   * için yeni deneme olarak da kullanılabilir (aynı
   * idempotencyKey ile).
   */
  submitDocument(request: EsmmSubmitRequest): Promise<EsmmSubmitResponse>;
  /**
   * Belge durumunu sorgular (provider'da). MVP'de mock no-op.
   */
  queryDocument(providerDocumentId: string): Promise<EsmmSubmitResponse>;
  /**
   * Provider'da belge iptali (mümkünse). MVP'de mock no-op.
   */
  cancelDocument(providerDocumentId: string): Promise<EsmmSubmitResponse>;
}
