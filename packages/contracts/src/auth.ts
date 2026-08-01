/**
 * @file Kimlik doğrulama ve oturum sözleşmesi.
 * @module @vetniva/contracts/auth
 *
 * @description Personel paneli için güvenli auth akışının Zod şemaları ve
 * türetilmiş tipleri. Personel paneli SSO/JWT sözleşmesi değildir; bu
 * modül platformun kendi auth katmanını tanımlar (cookie + opaque
 * token, DB'ye SHA-256 hash).
 *
 * Akış (Personel paneli):
 * 1. `POST /auth/login` — email + password → sessionToken cookie.
 * 2. `POST /auth/logout` — mevcut session'ı iptal eder.
 * 3. `POST /auth/refresh` — sliding session; yeni token üretir.
 * 4. `POST /auth/forgot` — email ile parola sıfırlama token'ı.
 * 5. `POST /auth/reset` — token + yeni parola.
 * 6. `POST /auth/change-password` — oturum açıkken parola değişimi.
 * 7. `POST /auth/invitations` — tenant admin kullanıcı davet eder.
 * 8. `POST /auth/invitations/accept` — davetli parola oluşturur.
 *
 * @security Parola bcrypt cost 12 ile hash'lenir. Token DB'de yalnızca
 * SHA-256 hash olarak bulunur. Plain token sadece login/reset
 * response'unda kullanıcıya döner ve asla loglanmaz.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 * @see docs/domain/DOMAIN_GLOSSARY.md (user, session varlık tanımları)
 * @see docs/errors/ERROR_CATALOG.md (VET-AUTH-* kodları)
 */

import { z } from "zod";

/** bcrypt cost factor. Yükseltmek maliyetli; 12 OWASP önerisi. */
export const BCRYPT_COST: number = 12;

/** Session varsayılan ömrü (saniye). 30 gün. */
export const SESSION_TTL_SECONDS: number = 60 * 60 * 24 * 30;

/** Session idle timeout (saniye). 24 saat. */
export const SESSION_IDLE_TIMEOUT_SECONDS: number = 60 * 60 * 24;

/** Parola sıfırlama token'ı ömrü (saniye). 1 saat. */
export const PASSWORD_RESET_TTL_SECONDS: number = 60 * 60;

/** Davet token'ı ömrü (saniye). 7 gün. */
export const INVITATION_TTL_SECONDS: number = 60 * 60 * 24 * 7;

/** Maksimum başarısız login denemesi. */
export const MAX_FAILED_LOGIN_COUNT: number = 5;

/** Hesap kilit süresi (saniye). 15 dakika. */
export const ACCOUNT_LOCK_SECONDS: number = 60 * 15;

/** Oturum cookie adı. */
export const SESSION_COOKIE_NAME = "vetniva_session" as const;

/** Parola policy: min 12 karakter, en az 1 küçük, 1 büyük, 1 rakam. */
export const passwordPolicySchema = z
  .string()
  .min(12, "Parola en az 12 karakter olmalı")
  .max(128, "Parola en fazla 128 karakter olabilir")
  .regex(/[a-z]/, "Parola en az bir küçük harf içermeli")
  .regex(/[A-Z]/, "Parola en az bir büyük harf içermeli")
  .regex(/[0-9]/, "Parola en az bir rakam içermeli");

/** E-posta policy. Sistem genelinde unique. */
export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(200)
  .email("Geçersiz e-posta formatı");

/** Görünen ad. */
export const userDisplayNameSchema = z
  .string()
  .trim()
  .min(2, "Ad en az 2 karakter olmalı")
  .max(200);

/** Desteklenen kullanıcı durumları. */
export const userStatusSchema = z.enum(["active", "suspended", "disabled"]);

/** Tenant üyesi olabilecek roller. SUPERADMIN sistem düzeyindedir. */
export const tenantRoleSchema = z.enum(["OWNER", "VETERINARIAN", "STAFF"]);

/** Tenant bağlamında actor rolü (login sonrası döner). */
export const actorRoleSchema = z.enum([
  "SUPERADMIN",
  "OWNER",
  "VETERINARIAN",
  "STAFF",
  "PET_OWNER_PORTAL",
  "SYSTEM",
]);

/**
 * Login isteği. Email + parola ile session oluşturur.
 * `tenantSlug` opsiyonel; SUPERADMIN yoksa birden fazla tenant'a
 * üye kullanıcı için tenant seçimi yapılır.
 */
export const loginRequestSchema = z.object({
  email: userEmailSchema,
  password: z.string().min(1, "Parola zorunlu").max(128),
  /** İsteğe bağlı tenant slug (multi-tenant üye kullanıcılar için). */
  tenantSlug: z.string().min(1).max(64).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Login response. Session token plain döner; client bunu cookie'ye
 * yazacak (httpOnly, secure, sameSite=lax).
 */
export const loginResponseSchema = z.object({
  sessionToken: z.string().min(32).max(128),
  expiresAt: z.string().datetime(),
  user: z.object({
    id: z.string().uuid(),
    email: userEmailSchema,
    displayName: userDisplayNameSchema,
    locale: z.string(),
  }),
  /** Aktif tenant context. SUPERADMIN tüm tenantları görebilir. */
  tenant: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      country: z.string(),
    })
    .nullable(),
  /** Tenant içi rol. SUPERADMIN için null. */
  role: actorRoleSchema.nullable(),
  /** Tenant içi branch bağlamı (GOAL-012 ile). */
  branchId: z.string().uuid().nullable(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * Logout isteği. Mevcut session'ı iptal eder; body boştur.
 */
export const logoutRequestSchema = z.object({}).optional();
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const logoutResponseSchema = z.object({
  revokedAt: z.string().datetime(),
});
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

/**
 * Refresh: sliding session yenileme. Yeni token döner; eski session
 * `replacedById` ile bağlanır.
 */
export const refreshResponseSchema = z.object({
  sessionToken: z.string().min(32).max(128),
  expiresAt: z.string().datetime(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

/**
 * Parola sıfırlama talebi. Email ile token üretir; response her
 * zaman 200 döner (email enumeration koruması).
 */
export const forgotPasswordRequestSchema = z.object({
  email: userEmailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const forgotPasswordResponseSchema = z.object({
  /** Kabul edilse de kabul edilmese de bu mesaj döner. */
  message: z.string(),
});
export type ForgotPasswordResponse = z.infer<
  typeof forgotPasswordResponseSchema
>;

/**
 * Parola sıfırlama (token + yeni parola). Token tek kullanımlıktır.
 */
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(32).max(128),
  newPassword: passwordPolicySchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const resetPasswordResponseSchema = z.object({
  message: z.string(),
  /** Yeni session token (otomatik giriş için opsiyonel). */
  sessionToken: z.string().min(32).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

/**
 * Oturum açıkken parola değişimi. Eski parola doğrulanır.
 */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordPolicySchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Yeni parola eskisiyle aynı olamaz",
    path: ["newPassword"],
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/**
 * Tenant'a kullanıcı daveti. Davet token mail ile gönderilir (şu an
 * stub; GOAL-015 ile notification entegrasyonu).
 */
export const inviteUserRequestSchema = z.object({
  email: userEmailSchema,
  role: tenantRoleSchema,
  /** Davet mesajı (opsiyonel). */
  message: z.string().max(500).optional(),
});
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;

export const inviteUserResponseSchema = z.object({
  invitationId: z.string().uuid(),
  email: userEmailSchema,
  role: tenantRoleSchema,
  expiresAt: z.string().datetime(),
  /** Davet link'i (sadece admin'e döner; email gönderimi de sağlanır). */
  invitationUrl: z.string(),
});
export type InviteUserResponse = z.infer<typeof inviteUserResponseSchema>;

/**
 * Davet kabul. Yeni parola oluşturur + User yaratır + membership atar.
 */
export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(32).max(128),
  displayName: userDisplayNameSchema,
  password: passwordPolicySchema,
  locale: z.enum(["tr-TR", "en-GB"]).default("tr-TR"),
});
export type AcceptInvitationRequest = z.infer<
  typeof acceptInvitationRequestSchema
>;

export const acceptInvitationResponseSchema = loginResponseSchema;
export type AcceptInvitationResponse = z.infer<
  typeof acceptInvitationResponseSchema
>;

/**
 * /me endpoint response. Aktif oturum + kullanıcı + tenant + üyelikler.
 */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: userEmailSchema,
    displayName: userDisplayNameSchema,
    locale: z.string(),
    status: userStatusSchema,
    lastLoginAt: z.string().datetime().nullable(),
    passwordChangedAt: z.string().datetime().nullable(),
  }),
  session: z.object({
    id: z.string().uuid(),
    expiresAt: z.string().datetime(),
    lastUsedAt: z.string().datetime(),
    ipAddress: z.string().nullable(),
  }),
  /** Aktif tenant. SUPERADMIN null döner (cross-tenant erişim). */
  tenant: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      country: z.string(),
      defaultLocale: z.string(),
      timezone: z.string(),
    })
    .nullable(),
  role: actorRoleSchema.nullable(),
  branchId: z.string().uuid().nullable(),
  /** Kullanıcının tüm aktif üyelikleri. */
  memberships: z.array(
    z.object({
      tenantId: z.string().uuid(),
      tenantSlug: z.string(),
      tenantName: z.string(),
      role: actorRoleSchema,
      status: z.enum(["active", "suspended", "revoked"]),
    }),
  ),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * Aktif oturum listesi (kullanıcının kendi session'ları). Logout
 * yönetimi için.
 */
export const sessionListItemSchema = z.object({
  id: z.string().uuid(),
  expiresAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  ipAddress: z.string().nullable(),
  isCurrent: z.boolean(),
  revokedAt: z.string().datetime().nullable(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export const sessionListResponseSchema = z.object({
  items: z.array(sessionListItemSchema),
});
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;

/**
 * Tenant bağlamı değiştirme (multi-tenant üye kullanıcılar için).
 * Mevcut oturumda aktif tenant'ı değiştirir; yeni bir session
 * üretmez.
 */
export const switchTenantRequestSchema = z.object({
  tenantSlug: z.string().min(1).max(64),
});
export type SwitchTenantRequest = z.infer<typeof switchTenantRequestSchema>;

/**
 * Brute-force koruması durumu (debug/admin için). Login response'unda
 * yer almaz; yalnızca admin/debug endpoint'leri içindir.
 */
export const authSecurityStatusSchema = z.object({
  userId: z.string().uuid(),
  failedLoginCount: z.number().int().min(0),
  lockedUntil: z.string().datetime().nullable(),
  lastFailedAt: z.string().datetime().nullable(),
});
export type AuthSecurityStatus = z.infer<typeof authSecurityStatusSchema>;

/** Tüm auth şemaları için ortak export. */
export const authSchemas = {
  loginRequest: loginRequestSchema,
  loginResponse: loginResponseSchema,
  logoutResponse: logoutResponseSchema,
  refreshResponse: refreshResponseSchema,
  forgotPasswordRequest: forgotPasswordRequestSchema,
  forgotPasswordResponse: forgotPasswordResponseSchema,
  resetPasswordRequest: resetPasswordRequestSchema,
  resetPasswordResponse: resetPasswordResponseSchema,
  changePasswordRequest: changePasswordRequestSchema,
  inviteUserRequest: inviteUserRequestSchema,
  inviteUserResponse: inviteUserResponseSchema,
  acceptInvitationRequest: acceptInvitationRequestSchema,
  acceptInvitationResponse: acceptInvitationResponseSchema,
  me: meResponseSchema,
  sessionListItem: sessionListItemSchema,
  sessionListResponse: sessionListResponseSchema,
  switchTenantRequest: switchTenantRequestSchema,
  authSecurityStatus: authSecurityStatusSchema,
  passwordPolicy: passwordPolicySchema,
  userEmail: userEmailSchema,
  userDisplayName: userDisplayNameSchema,
  userStatus: userStatusSchema,
  tenantRole: tenantRoleSchema,
  actorRole: actorRoleSchema,
} as const;
