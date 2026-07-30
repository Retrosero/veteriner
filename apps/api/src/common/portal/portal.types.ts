/**
 * @file Portal erişim daveti domain tipleri.
 * @module apps/api/common/portal/portal.types
 *
 * @description GOAL-025 portal erişim daveti domain modeli.
 * Tenant yönetimi (STAFF/VETERINARIAN), belirli bir owner
 * (hasta sahibi) için e-posta adresine portal davet linki
 * oluşturur. Davet, tek kullanımlık bir token ile kabul edilir;
 * süre dolduğunda veya iptal edildiğinde geçersiz sayılır.
 *
 * Davet durumları:
 * - `pending`   : oluşturuldu, kabul bekleniyor (createdAt, expiresAt set)
 * - `accepted`  : token ile kabul edildi, PortalUser oluşturuldu
 * - `expired`   : expiresAt geçti (resolve/accept sırasında işaretlenir)
 * - `revoked`   : tenant yönetimi tarafından iptal edildi
 *
 * @security Token, kabul adımında tek seferliktir. Token türetmek
 *   için yeterli bilgi sızdırmaz (URL-safe UUID v4). Email PII
 *   olmasına rağmen iş süreci için saklanır; log/maskeleme
 *   AuditService PiiMasker üzerinden yapılır.
 *
 * @since GOAL-025 (FAZ-2) portal erişim daveti
 */

export type PortalInvitationStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked";

/** Davet kabul edildiğinde tenant'ta oluşturulan portal kullanıcısı. */
export interface PortalUser {
  id: string;
  tenantId: string;
  invitationId: string;
  email: string;
  ownerId: string;
  patientIds: string[];
  createdAt: string;
}

/**
 * Davet oluşturma girdisi. `ownerId` ve `patientIds` aynı tenant
 * içinde doğrulanır; `email` lower-case normalize edilir.
 */
export interface PortalInviteInput {
  ownerId: string;
  email: string;
  patientIds: string[];
  /** 1-30 gün. 30 gün pilot üst sınırı. */
  expiresInDays: number;
  locale: "tr-TR" | "en-GB";
}

/** Davet kaydı. Token kabul akışında gerektiğinde response'a dahil edilir. */
export interface PortalInvitation {
  id: string;
  tenantId: string;
  ownerId: string;
  email: string;
  status: PortalInvitationStatus;
  invitedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  /** Davet kabul token'ı. URL-safe (randomUUID). */
  invitationToken: string;
  patientIds: string[];
  locale: "tr-TR" | "en-GB";
  invitedBy: string | null;
}

/**
 * Davet kabul sonucu. PortalUser'ın ilk session token'ı ile birlikte
 * döner. Bu token'ın nasıl saklanacağı (cookie vs.) controller
 * katmanında ele alınır.
 */
export interface PortalAcceptResult {
  portalUserId: string;
  sessionToken: string;
}

/** Davet kabul isteği (public, token tabanlı). */
export interface PortalAcceptInput {
  token: string;
  passwordHash?: string | undefined;
}
