/**
 * @file Portal kimlik doğrulama sözleşmesi.
 * @module @vetniva/contracts/portal-auth
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş API
 * sözleşmesi. Zod şemaları + tipler. Backend (request/response
 * doğrulama) ve frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Mimari:
 * - Personel auth'undan ayrı bir auth path. Session tipi
 *   `portal_session`; cookie adı `vetniva_portal_session`.
 * - Direct register: davet üzerinden değil, email + parola + ownerId
 *   ile (tenant admin owner'ı önceden oluşturur; sahip email + KVKK
 *   consent ile kayıt olur).
 * - Login: email + parola. Multi-tenant destekli (tenant slug
 *   opsiyonel; verilirse filtre).
 * - Parola sıfırlama: forgot-password + reset-password token flow.
 *
 * @security
 * - Parola bcrypt cost 12 ile hash'lenir; plain asla loglanmaz.
 * - 5 başarısız deneme sonrası 15 dakika kilitleme.
 * - Hata mesajları genelleştirilmiş; email enumeration koruması.
 * - Session 30 gün TTL; idle timeout 24 saat.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal hesap kayıt ve giriş
 */

import { z } from "zod";

import { passwordPolicySchema } from "./auth.js";

/** Portal session cookie adı. Personel cookie'sinden ayrı. */
export const PORTAL_SESSION_COOKIE_NAME = "vetniva_portal_session" as const;

/** Portal session varsayılan ömrü (saniye). 30 gün. */
export const PORTAL_SESSION_TTL_SECONDS: number = 60 * 60 * 24 * 30;

/** Portal session idle timeout (saniye). 24 saat. */
export const PORTAL_SESSION_IDLE_TIMEOUT_SECONDS: number = 60 * 60 * 24;

/** Email doğrulama token TTL (saniye). 24 saat. */
export const EMAIL_VERIFICATION_TTL_SECONDS: number = 60 * 60 * 24;

/**
 * Portal kayıt isteği. Email + parola + ownerId ile yeni portal
 * hesabı oluşturur. KVKK açık rıza onayı zorunludur.
 *
 * ownerId önceden tenant admin tarafından oluşturulmuş olmalıdır
 * (cross-tenant → 404 VET-AUTHZ-0002).
 */
export const portalRegisterRequestSchema = z.object({
  email: z.string().email().max(200),
  password: passwordPolicySchema,
  ownerId: z.string().uuid(),
  /** KVKK / açık rıza onayı; true olmalı. */
  consentKvkk: z.literal(true),
  /** Opsiyonel görünen isim. */
  displayName: z.string().min(1).max(100).optional(),
  /** Locale. */
  locale: z.enum(["tr-TR", "en-GB"]).optional(),
});
export type PortalRegisterRequest = z.infer<typeof portalRegisterRequestSchema>;

/**
 * Davet üzerinden portal kayıt isteği. Davet token'ı zorunlu;
 * portalService üzerinden doğrulanır. Davet expired veya
 * revoked ise 410. Aynı email ile kayıt varsa 409.
 */
export const portalRegisterByInvitationRequestSchema = z.object({
  token: z.string().min(32).max(128),
  email: z.string().email().max(200),
  password: passwordPolicySchema,
  consentKvkk: z.literal(true),
  displayName: z.string().min(1).max(100).optional(),
  locale: z.enum(["tr-TR", "en-GB"]).optional(),
});
export type PortalRegisterByInvitationRequest = z.infer<
  typeof portalRegisterByInvitationRequestSchema
>;

/**
 * Email doğrulama isteği. Token tek seferlik; 24 saat geçerli.
 */
export const portalVerifyEmailRequestSchema = z.object({
  token: z.string().min(32).max(128),
});
export type PortalVerifyEmailRequest = z.infer<
  typeof portalVerifyEmailRequestSchema
>;

/**
 * Portal login isteği. Email + parola ile giriş. Tenant slug
 * opsiyonel (multi-tenant pilot).
 */
export const portalLoginRequestSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
  tenantSlug: z.string().min(1).max(64).optional(),
});
export type PortalLoginRequest = z.infer<typeof portalLoginRequestSchema>;

/**
 * Parola sıfırlama talebi. Email ile token üretir; response her
 * durumda 200 OK (email enumeration koruması).
 */
export const portalForgotPasswordRequestSchema = z.object({
  email: z.string().email().max(200),
  tenantSlug: z.string().min(1).max(64).optional(),
});
export type PortalForgotPasswordRequest = z.infer<
  typeof portalForgotPasswordRequestSchema
>;

/**
 * Parola sıfırlama (token + yeni parola). Token tek kullanımlıktır;
 * 1 saat geçerli.
 */
export const portalResetPasswordRequestSchema = z.object({
  token: z.string().min(32).max(128),
  newPassword: passwordPolicySchema,
});
export type PortalResetPasswordRequest = z.infer<
  typeof portalResetPasswordRequestSchema
>;

/** Generic başarı/hata mesajı response'u. */
export const portalMessageResponseSchema = z.object({
  message: z.string(),
});
export type PortalMessageResponse = z.infer<typeof portalMessageResponseSchema>;

/** Forgot password response (token opsiyonel — debug amaçlı FAZ-0). */
export const portalForgotPasswordResponseSchema = z.object({
  message: z.string(),
  /** FAZ-0: debug; FAZ-3+'da email ile gönderilecek. */
  resetToken: z.string().optional(),
});
export type PortalForgotPasswordResponse = z.infer<
  typeof portalForgotPasswordResponseSchema
>;

/** Portal user DTO. */
export const portalUserSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
  email: z.string().email(),
  status: z.enum(["active", "locked", "pending_password"]),
  failedLoginCount: z.number().int().min(0),
  lockedUntil: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().optional(),
});
export type PortalUserDto = z.infer<typeof portalUserSchema>;

/** Login response (user + session token). */
export const portalLoginResponseSchema = z.object({
  user: portalUserSchema,
  sessionToken: z.string().min(32).max(128),
  expiresAt: z.string().datetime(),
});
export type PortalLoginResponse = z.infer<typeof portalLoginResponseSchema>;

/**
 * Portal session response (cookie + JSON). Owner bilgisi ve
 * tenant özeti içerir. register + login sonrası döner.
 */
export const portalSessionResponseSchema = z.object({
  sessionToken: z.string().min(32).max(128),
  expiresAt: z.string().datetime(),
  portalUser: z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string().nullable(),
    locale: z.enum(["tr-TR", "en-GB"]),
    ownerId: z.string().uuid(),
    patientIds: z.array(z.string().uuid()),
  }),
  tenant: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    country: z.string(),
  }),
});
export type PortalSessionResponse = z.infer<typeof portalSessionResponseSchema>;

/** Authenticated portal me response. */
export const portalMeResponseSchema = z.object({
  portalUserId: z.string(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  locale: z.enum(["tr-TR", "en-GB"]),
  ownerId: z.string().uuid(),
  patientIds: z.array(z.string().uuid()),
  status: z.enum(["active", "locked", "pending_password"]),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable(),
});
export type PortalMeResponse = z.infer<typeof portalMeResponseSchema>;

/** Authenticated parola değişimi isteği. */
export const portalChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordPolicySchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Yeni parola mevcut paroladan farklı olmalı",
    path: ["newPassword"],
  });
export type PortalChangePasswordRequest = z.infer<
  typeof portalChangePasswordRequestSchema
>;
