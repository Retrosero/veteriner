/**
 * @file Güvenlik olayı (SecurityEvent) domain tipleri.
 * @module apps/api/common/security-events/security-event.types
 *
 * @description GOAL-105 (FAZ-10) SecurityEvent için iç kayıt
 * tipleri. In-memory Map'te tutulur; production'a geçişte
 * Prisma `SecurityEvent` tablosu ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * `SecurityEventRecord` ile `SecurityEvent` ayrılmıştır: record
 * repository içi tam yapı (fingerprint, occurrenceCount, ipAddress
 * mask'lı, userAgentHash kısa hash vb.) iken `SecurityEvent` API'ye
 * dönen public shape'tir.
 *
 * @security `context` alanı PII mask'lı payload taşır; record
 *   tarafında bu garanti zaten uygulanır (mask'lenmemiş context
 *   kabul edilmez). `ipAddress` `192.168.1.***` formatında saklanır.
 *   `userAgentHash` 8 hex karakterdir.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import type {
  ErrorCode,
  SecurityEvent,
  SecurityEventActorType,
  SecurityEventCountry,
  SecurityEventCreateInput,
  SecurityEventModule,
  SecurityEventSeverity,
  SecurityEventType,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Persist edilmiş kayıt
 * --------------------------------------------------------------------------
 */

/** Repository içi tam kayıt. */
export interface SecurityEventRecord {
  id: string;
  requestId: string;
  tenantId: string | null;
  branchId: string | null;
  userId: string | null;
  actorType: SecurityEventActorType;
  type: SecurityEventType;
  module: SecurityEventModule;
  route: string;
  release: string;
  severity: SecurityEventSeverity;
  fingerprint: string;
  errorCode: ErrorCode | null;
  message: string;
  statusCode: number | null;
  /** Mask'li IP (192.168.1.***). */
  ipAddress: string | null;
  /** Kısa user agent hash (8 hex). */
  userAgentHash: string | null;
  context: Record<string, unknown>;
  country: SecurityEventCountry;
  occurredAt: string;
  /** İlk görülme zamanı (UTC). İlk oluşturulduğunda sabitlenir. */
  firstSeenAt: string;
  /** Son görülme zamanı (UTC). Her upsert'te güncellenir. */
  lastSeenAt: string;
  /** Aynı fingerprint'in toplam tekrar sayısı (1+). */
  occurrenceCount: number;
  /** Critical olayda alarm adapter tetiklendi mi? */
  alertSent: boolean;
}

/* --------------------------------------------------------------------------
 * Record → public dönüşüm
 * --------------------------------------------------------------------------
 */

export function toSecurityEvent(rec: SecurityEventRecord): SecurityEvent {
  return {
    id: rec.id,
    requestId: rec.requestId,
    tenantId: rec.tenantId,
    branchId: rec.branchId,
    userId: rec.userId,
    actorType: rec.actorType,
    type: rec.type,
    module: rec.module,
    route: rec.route,
    release: rec.release,
    severity: rec.severity,
    fingerprint: rec.fingerprint,
    errorCode: rec.errorCode,
    message: rec.message,
    statusCode: rec.statusCode,
    ipAddress: rec.ipAddress,
    userAgentHash: rec.userAgentHash,
    context: rec.context,
    country: rec.country,
    occurredAt: rec.occurredAt,
    firstSeenAt: rec.firstSeenAt,
    lastSeenAt: rec.lastSeenAt,
    occurrenceCount: rec.occurrenceCount,
    alertSent: rec.alertSent,
  };
}

/** CreateInput iç kullanım için kısayol. */
export type SecurityEventRecordInput = SecurityEventCreateInput;
