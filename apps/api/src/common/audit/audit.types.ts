/**
 * @file Audit event tipleri.
 * @module apps/api/common/audit/audit.types
 *
 * @description Audit log'a yazılacak event'lerin TypeScript
 * tipleri. Şema: docs/errors/AUDIT_LOG_STANDARD.md ve
 * AUDIT_EVENTS.yaml. Tüm audit event'lerde PII alanları
 * mask'lenmiş halde yazılır (bkz. PII_MASKING.md).
 *
 * @security Append-only. UPDATE / DELETE yok. Critical
 *   severity event'ler anlık alert tetikler.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

/**
 * Desteklenen audit action türleri. Katalog:
 * docs/errors/AUDIT_EVENTS.yaml.
 */
export type AuditAction =
  | "create"
  | "read"
  | "update"
  | "archive"
  | "restore"
  | "erase"
  | "export"
  | "sign"
  | "amend"
  | "complete"
  | "cancel"
  | "reverse"
  | "transfer"
  | "adjust"
  | "dispense"
  | "admit"
  | "discharge"
  | "invite"
  | "assign_role"
  | "format_currency"
  | "send"
  | "receive"
  | "refresh"
  | "acknowledge";

/**
 * Audit event'i başlatan aktör tipi.
 * - user: tenant kullanıcısı
 * - system: scheduled job veya internal process
 * - integration: dış servis callback
 * - job: BullMQ worker
 */
export type AuditActorType =
  | "user"
  | "system"
  | "integration"
  | "job"
  | "portal_user";

/**
 * Audit event ciddiyet seviyesi.
 */
export type AuditSeverity = "info" | "warning" | "error" | "critical";

/**
 * Audit event input. AuditService.record() metodu ile
 * kullanılır. PII alanları mask'lenmiş olmalıdır.
 */
export interface AuditEventInput {
  /** "audit:owner.create" formatında. */
  eventName: string;
  /** Tenant context (varsa). SYSTEM event'lerde null. */
  tenantId: string | null;
  /** Şube (multi-branch). */
  branchId?: string | null;
  /** İşlemi yapan kullanıcı. SYSTEM event'lerde null. */
  actorId: string | null;
  /** Aktör tipi. */
  actorType: AuditActorType;
  /** Etkilenen varlık tipi (owner, patient, ...). */
  targetType: string;
  /** Varlık ID. */
  targetId: string;
  /** İşlem tipi. */
  action: AuditAction;
  /** Değişiklik öncesi varlık durumu (mask'li). */
  before?: Record<string, unknown> | null;
  /** Değişiklik sonrası varlık durumu (mask'li). */
  after?: Record<string, unknown> | null;
  /** Alan-bazlı fark (sadece değişen alanlar). */
  diff?: Record<string, unknown> | null;
  /** req-... / job-... / int-... formatında. */
  correlationId: string;
  /** Mask'li IP (192.168.1.***). */
  ipAddress?: string | null;
  /** User agent hash. */
  userAgentHash?: string | null;
  /** Tenant ülkesi (TR/GB). */
  country: string;
  /** Event severity. */
  severity: AuditSeverity;
  /** Ek bağlam. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Persist edilmiş audit event. eventId ve timestamp
 * AuditService tarafından üretilir.
 */
export interface AuditEvent extends AuditEventInput {
  /** Benzersiz event ID. */
  eventId: string;
  /** ISO 8601 UTC. */
  timestamp: string;
}
