/**
 * @file Merkezi backend hata olayı (ErrorEvent) domain tipleri.
 * @module apps/api/common/error-events/error-event.types
 *
 * @description GOAL-100 (FAZ-10) ErrorEvent için iç kayıt
 * tipleri. In-memory Map'te tutulur; production'a geçişte
 * Prisma `ErrorEvent` tablosu ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * `ErrorEventRecord` ile `ErrorEvent` ayrılmıştır: record
 * repository içi tam yapı (fingerprint, occurrenceCount, vb.)
 * iken ErrorEvent API'ye dönen public shape'tir.
 *
 * @security `context` alanı PII mask'lı payload taşır; record
 *   tarafında bu garanti zaten uygulanır (mask'lenmemiş context
 *   kabul edilmez). `stack` yalnızca 5xx + critical için saklanır.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import type {
  ErrorEvent,
  ErrorEventActorType,
  ErrorEventCountry,
  ErrorEventCreateInput,
  ErrorEventModule,
} from "@vetniva/contracts";
import type { ErrorCode, ErrorSeverity } from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Persist edilmiş kayıt
 * --------------------------------------------------------------------------
 */

/** Repository içi tam kayıt. */
export interface ErrorEventRecord {
  id: string;
  requestId: string;
  tenantId: string | null;
  branchId: string | null;
  userId: string | null;
  actorType: ErrorEventActorType;
  module: ErrorEventModule;
  route: string;
  release: string;
  severity: ErrorSeverity;
  fingerprint: string;
  errorCode: ErrorCode;
  message: string;
  statusCode: number;
  stack: string | null;
  context: Record<string, unknown>;
  country: ErrorEventCountry;
  occurredAt: string;
  /** Aynı fingerprint'in toplam tekrar sayısı (1+). */
  occurrenceCount: number;
}

export type {
  ErrorEvent,
  ErrorEventCreateInput,
  ErrorEventModule,
  ErrorEventActorType,
  ErrorEventCountry,
  ErrorCode,
  ErrorSeverity,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşüm
 * --------------------------------------------------------------------------
 */

export function toErrorEvent(rec: ErrorEventRecord): ErrorEvent {
  return {
    id: rec.id,
    requestId: rec.requestId,
    tenantId: rec.tenantId,
    branchId: rec.branchId,
    userId: rec.userId,
    actorType: rec.actorType,
    module: rec.module,
    route: rec.route,
    release: rec.release,
    severity: rec.severity,
    fingerprint: rec.fingerprint,
    errorCode: rec.errorCode,
    message: rec.message,
    statusCode: rec.statusCode,
    stack: rec.stack,
    context: rec.context,
    country: rec.country,
    occurredAt: rec.occurredAt,
    occurrenceCount: rec.occurrenceCount,
  };
}
