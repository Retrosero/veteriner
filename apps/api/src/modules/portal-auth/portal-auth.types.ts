/**
 * @file Portal auth domain tipleri.
 * @module apps/api/modules/portal-auth/portal-auth.types
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş
 * domain modeli. Personel auth'undan ayrı bir path; `PortalUser`
 * ayrı bir varlıktır. Tenant-scoped, ownerId ve hasta(lar) ile
 * bağlıdır.
 *
 * Hesap yaşam döngüsü (`status`):
 * - `active`            : parola set edilmiş, login yapabilir
 * - `locked`            : brute-force kilidi; unlock için
 *                         `lockedUntil` süresinin geçmesi beklenir
 * - `pending_password`  : davet kabul edilmiş ama parola set
 *                         edilmemiş; login reddedilir (VET-PORTAL-0005)
 *
 * @security Parola bcrypt cost 12 ile hash'lenir; plain asla
 *   loglanmaz, audit payload'ında yer almaz.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal kayıt ve giriş
 */

/** Portal kullanıcı durumları. */
export type PortalUserStatus = "active" | "locked" | "pending_password";

/** Portal user kaydı (in-memory). DB migration'ında Prisma modeline
 *  dönüşecek; alan isimleri korunur. */
export interface PortalUserRecord {
  id: string;
  tenantId: string;
  ownerId: string;
  email: string;
  /** Bcrypt cost 12 hash. */
  passwordHash: string | null;
  status: PortalUserStatus;
  /** KVKK / açık rıza onayı. true olmadan login yapılamaz. */
  consentKvkk: boolean;
  /** KVKK onay zaman damgası. */
  consentKvkkAt: string | null;
  /** Başarısız login sayacı; 5'e ulaşınca lockedUntil set edilir. */
  failedLoginCount: number;
  /** Lock bitiş zamanı (ISO). null ise kilit yok. */
  lockedUntil: string | null;
  createdAt: string;
  /** Son başarılı login. */
  lastLoginAt: string | null;
  /** Opsiyonel: bağlı hasta(lar). */
  patientIds: string[];
  /** Opsiyonel: görünen isim. */
  displayName: string | null;
  /** Locale. */
  locale: "tr-TR" | "en-GB";
}

/** Portal session kaydı (in-memory). */
export interface PortalSessionRecord {
  /** Plain session token; response'da döner. */
  sessionToken: string;
  portalUserId: string;
  tenantId: string;
  /** epoch ms. */
  createdAt: number;
  /** epoch ms. */
  expiresAt: number;
  /** epoch ms; sliding window. */
  lastActivityAt: number;
  ipAddress: string | null;
  userAgentHash: string | null;
}

/** Parola sıfırlama token kaydı. */
export interface PortalPasswordResetRecord {
  /** SHA-256 hash. */
  tokenHash: string;
  portalUserId: string;
  tenantId: string;
  /** epoch ms. */
  createdAt: number;
  /** epoch ms; 1 saat. */
  expiresAt: number;
  /** Kullanıldı mı? Tek seferlik. */
  usedAt: number | null;
}

/** Service-layer public DTO. */
export interface PortalUser {
  id: string;
  tenantId: string;
  ownerId: string;
  email: string;
  status: PortalUserStatus;
  failedLoginCount: number;
  lockedUntil?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface PortalSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface PortalLoginInput {
  email: string;
  password: string;
  tenantSlug?: string;
}

/** Login denemesi için toplanan meta (AuthService.AttemptContext ile
 *  uyumlu). */
export interface PortalAttemptContext {
  ipAddress: string | null;
  userAgentHash: string | null;
  correlationId: string;
}
