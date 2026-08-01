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
 * GOAL-104 ile birlikte eklenen kayıtlar:
 * - `ErrorEventNoteRecord`         : çözüm notları (append-only).
 * - `ErrorEventSupportLinkRecord`  : destek bağlantıları.
 * - `ErrorEventAssignmentRecord`   : atama geçmişi.
 *
 * @security `context` alanı PII mask'lı payload taşır; record
 *   tarafında bu garanti zaten uygulanır (mask'lenmemiş context
 *   kabul edilmez). `stack` yalnızca 5xx + critical için saklanır.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 * @updated GOAL-104 (FAZ-10) hata atama ve çözüm notları core
 */

import type {
  ErrorEvent,
  ErrorEventActorType,
  ErrorEventAssignmentRecord,
  ErrorEventCountry,
  ErrorEventCreateInput,
  ErrorEventModule,
  ErrorEventNote,
  ErrorEventStatus,
  ErrorEventStatusTransition,
  ErrorEventSupportLink,
  ErrorCode,
  ErrorSeverity,
} from "@vetniva/contracts";

/** Yerel not görünürlüğü tipi (contracts'tan türetilir). */
export type ErrorEventNoteVisibility = ErrorEventNote["visibility"];

/** Yerel destek sistemi tipi (contracts'tan türetilir). */
export type ErrorEventSupportSystem = NonNullable<
  ErrorEventSupportLink["system"]
>;

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
  /** İlk görülme zamanı (UTC). İlk oluşturulduğunda sabitlenir. */
  firstSeenAt: string;
  /** Son görülme zamanı (UTC). Her upsert'te güncellenir. */
  lastSeenAt: string;
  /** Aynı fingerprint'in toplam tekrar sayısı (1+). */
  occurrenceCount: number;
  /** SUPERADMIN hata merkezi durum yönetimi (GOAL-103). */
  status: ErrorEventStatus;
  /** Atanan SUPERADMIN kullanıcı ID. */
  assignedToUserId: string | null;
}

/** Hata durumu geçiş kaydı (append-only audit). */
export interface ErrorEventStatusTransitionRecord {
  id: string;
  fingerprint: string;
  fromStatus: ErrorEventStatus;
  toStatus: ErrorEventStatus;
  actorId: string;
  actorType: ErrorEventActorType;
  reason: string | null;
  occurredAt: string;
}

/* --------------------------------------------------------------------------
 * Çözüm notu — GOAL-104
 * --------------------------------------------------------------------------
 */

/** Çözüm notu repository kaydı. Append-only; silinemez. */
export interface ErrorEventNoteRecord {
  id: string;
  fingerprint: string;
  authorId: string;
  authorType: ErrorEventActorType;
  body: string;
  visibility: ErrorEventNoteVisibility;
  createdAt: string;
}

/* --------------------------------------------------------------------------
 * Destek kaydı bağlantısı — GOAL-104
 * --------------------------------------------------------------------------
 */

/** Destek kaydı bağlantısı repository kaydı. */
export interface ErrorEventSupportLinkRecord {
  id: string;
  fingerprint: string;
  system: ErrorEventSupportSystem;
  externalId: string | null;
  url: string | null;
  title: string | null;
  createdById: string;
  createdByType: ErrorEventActorType;
  createdAt: string;
}

/* --------------------------------------------------------------------------
 * Atama geçmişi — GOAL-104
 * --------------------------------------------------------------------------
 */

/**
 * Atama geçmişi repository kaydı. Append-only; her atama/kaldırma
 * aksiyonu yeni kayıt oluşturur. `assigneeId === "unassigned"`
 * atama kaldırma anlamına gelir (özel sentetik değer).
 */
export interface ErrorEventAssignmentRecordInternal {
  id: string;
  fingerprint: string;
  assigneeId: string;
  assignedById: string;
  assignedByType: ErrorEventActorType;
  reason: string | null;
  assignedAt: string;
}

/** Unassign sentetik assignee değeri. */
export const UNASSIGNED = "unassigned" as const;

export type {
  ErrorEvent,
  ErrorEventCreateInput,
  ErrorEventModule,
  ErrorEventActorType,
  ErrorEventCountry,
  ErrorEventStatus,
  ErrorEventStatusTransition,
  ErrorEventNote,
  ErrorEventSupportLink,
  ErrorEventAssignmentRecord,
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
    firstSeenAt: rec.firstSeenAt,
    lastSeenAt: rec.lastSeenAt,
    occurrenceCount: rec.occurrenceCount,
    status: rec.status,
    assignedToUserId: rec.assignedToUserId,
  };
}

/** Status transition record → public şema. */
export function toErrorEventStatusTransition(
  rec: ErrorEventStatusTransitionRecord,
): ErrorEventStatusTransition {
  return {
    id: rec.id,
    fingerprint: rec.fingerprint,
    fromStatus: rec.fromStatus,
    toStatus: rec.toStatus,
    actorId: rec.actorId,
    actorType: rec.actorType,
    reason: rec.reason,
    occurredAt: rec.occurredAt,
  };
}

/* --------------------------------------------------------------------------
 * Record → public dönüşüm — GOAL-104
 * --------------------------------------------------------------------------
 */

/** Çözüm notu record → public şema. */
export function toErrorEventNote(rec: ErrorEventNoteRecord): ErrorEventNote {
  return {
    id: rec.id,
    fingerprint: rec.fingerprint,
    authorId: rec.authorId,
    authorType: rec.authorType,
    body: rec.body,
    visibility: rec.visibility,
    createdAt: rec.createdAt,
  };
}

/** Destek bağlantısı record → public şema. */
export function toErrorEventSupportLink(
  rec: ErrorEventSupportLinkRecord,
): ErrorEventSupportLink {
  return {
    id: rec.id,
    fingerprint: rec.fingerprint,
    system: rec.system,
    externalId: rec.externalId,
    url: rec.url,
    title: rec.title,
    createdById: rec.createdById,
    createdByType: rec.createdByType,
    createdAt: rec.createdAt,
  };
}

/**
 * Atama kaydı (internal) → public şema. `unassigned` sentetik
 * assignee değeri olduğu gibi bırakılır; UI katmanı görüntüleme
 * sırasında "Atama kaldırıldı" gibi render eder.
 */
export function toErrorEventAssignment(
  rec: ErrorEventAssignmentRecordInternal,
): ErrorEventAssignmentRecord {
  return {
    id: rec.id,
    fingerprint: rec.fingerprint,
    assigneeId: rec.assigneeId,
    assignedById: rec.assignedById,
    assignedByType: rec.assignedByType,
    reason: rec.reason,
    assignedAt: rec.assignedAt,
  };
}
