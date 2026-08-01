/**
 * @file Portal erişim daveti sözleşmesi.
 * @module @vetniva/contracts/portal
 *
 * @description GOAL-025 portal erişim daveti API sözleşmesi. Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Davet yaşam döngüsü: `pending → (accepted | expired | revoked)`.
 * Kabul token'ı (UUID v4) tek seferliktir; response'da yalnızca
 * oluşturan kullanıcıya görünür.
 *
 * @security Sözleşmede PII (e-posta) alanı vardır; ancak backend
 *   AuditService PiiMasker ile log'lamada mask'lenir. Frontend'de
 *   renderlarken tenant kullanıcısının kendi davetleri için
 *   gösterilir.
 *
 * @since GOAL-025 (FAZ-2) portal erişim daveti
 */

import { z } from "zod";

/** Davet yaşam döngüsü durumu. */
export const portalInvitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export type PortalInvitationStatus = z.infer<
  typeof portalInvitationStatusSchema
>;

/** Davet oluşturma isteği. Service tenant + email normalize + token üretir. */
export const portalInviteInputSchema = z.object({
  ownerId: z.string().uuid(),
  email: z.string().email().max(200),
  /** Davet kapsamındaki hasta (patient) ID'leri. En az 1. */
  patientIds: z.array(z.string().uuid()).min(1).max(50),
  /** 1-30 gün. */
  expiresInDays: z.number().int().min(1).max(30),
  locale: z.enum(["tr-TR", "en-GB"]),
});
export type PortalInviteInput = z.infer<typeof portalInviteInputSchema>;

/** Davet kabul isteği (public). */
export const portalAcceptInputSchema = z.object({
  /** URL-safe UUID v4 token. */
  token: z.string().uuid(),
  /** Opsiyonel: parola hash (GOAL-033 portal login ile birlikte). */
  passwordHash: z.string().min(1).max(200).optional(),
});
export type PortalAcceptInput = z.infer<typeof portalAcceptInputSchema>;

/** Owner'a ait davetleri listeleme sorgusu. */
export const portalListQuerySchema = z.object({
  ownerId: z.string().uuid(),
});
export type PortalListQuery = z.infer<typeof portalListQuerySchema>;

/** API response: davet. */
export const portalInvitationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
  email: z.string().email(),
  status: portalInvitationStatusSchema,
  invitedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  invitationToken: z.string().uuid(),
  patientIds: z.array(z.string().uuid()),
  locale: z.enum(["tr-TR", "en-GB"]),
  invitedBy: z.string().nullable(),
});
export type PortalInvitation = z.infer<typeof portalInvitationSchema>;

/** Liste response. */
export const portalInvitationListResponseSchema = z.object({
  items: z.array(portalInvitationSchema),
  total: z.number().int().nonnegative(),
});
export type PortalInvitationListResponse = z.infer<
  typeof portalInvitationListResponseSchema
>;

/** Davet kabul sonucu. */
export const portalAcceptResponseSchema = z.object({
  portalUserId: z.string(),
  sessionToken: z.string().uuid(),
});
export type PortalAcceptResponse = z.infer<typeof portalAcceptResponseSchema>;
