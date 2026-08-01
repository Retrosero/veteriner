/**
 * @file Kimlik doğrulama servisi.
 * @module apps/api/common/auth/auth.service
 * @description Personel paneli için auth akışının iş kuralları.
 * Login, logout, refresh, parola sıfırlama, davet oluşturma/kabul,
 * parola değişimi. Brute-force koruması, audit event yayını, PII
 * maskeleme burada yapılır.
 *
 * İş kuralları:
 * - Email unique. Login email case-insensitive.
 * - Parola bcrypt cost 12 ile hash'lenir; plain asla loglanmaz.
 * - 5 başarısız deneme sonrası hesap 15 dakika kilitlenir.
 * - Session 30 gün TTL; idle timeout 24 saat.
 * - Refresh: eski session rotate edilir (replacedById bağlanır).
 * - Parola sıfırlama token'ı 1 saat geçerli, tek kullanımlık.
 * - Davet token'ı 7 gün geçerli, tek kullanımlık.
 * - Başarısız login VET-AUTH-0002 (genel mesaj) döner; detaylar
 *   audit/security log'a yazılır.
 * @security
 * - Login response mesajı her zaman genel ("kimlik bilgileri
 *   hatalı"); hesap var/yok bilgisi sızdırılmaz.
 * - Forgot password response her durumda 200 OK (email enumeration
 *   koruması).
 * - Token DB'de SHA-256 hash; plain sadece response'da.
 * - Tüm auth event'leri audit_events tablosuna append-only yazılır.
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ACCOUNT_LOCK_SECONDS,
  INVITATION_TTL_SECONDS,
  MAX_FAILED_LOGIN_COUNT,
  PASSWORD_RESET_TTL_SECONDS,
  SESSION_IDLE_TIMEOUT_SECONDS,
  SESSION_TTL_SECONDS,
  actorRoleSchema,
  type AcceptInvitationRequest,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type InviteUserRequest,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type ResetPasswordRequest,
  type SwitchTenantRequest,
} from "@vetniva/contracts";

import { AuthRepository } from "./auth.repository.js";
import { BruteForceGuard } from "./brute-force.js";
import { hashPassword, verifyPassword } from "./password.js";
import { generateToken, hashToken } from "./token.js";
import { TenantRepository } from "../../modules/tenant/tenant.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { DomainError } from "../errors/domain-error.js";
import { PiiMasker } from "../logging/pii-masker.js";

import type {
  ActorContext,
  ActorRole,
} from "../actor/actor-context.service.js";
import type { User } from "@prisma/client";

/** Login denemesinde toplanan metadata. */
interface AttemptContext {
  ipAddress: string | null;
  userAgentHash: string | null;
  correlationId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly masker = new PiiMasker();

  public constructor(
    private readonly repo: AuthRepository,
    private readonly tenants: TenantRepository,
    private readonly audit: AuditService,
    private readonly bruteForce: BruteForceGuard,
  ) {}

  // ===========================================================================
  // LOGIN
  // ===========================================================================

  public async login(
    input: LoginRequest,
    ctx: AttemptContext,
  ): Promise<LoginResponse> {
    const email = input.email.toLowerCase().trim();
    const user = await this.repo.findUserByEmail(email);

    // Hata mesajı sabit — kullanıcı var/yok bilgisi sızdırılmaz.
    const failGeneric = (): never => {
      throw new DomainError({
        errorCode: "VET-AUTH-0002",
        message: "E-posta veya parola hatalı",
        httpStatus: 401,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0002",
      });
    };

    if (!user) {
      // Bilinmeyen email → in-memory sayaç (timing attack koruması).
      // bcrypt çalıştırılarak zaman eşitlenir.
      await hashPassword("decoy-password-for-timing-equalization");
      this.bruteForce.recordFailure(`email:${email}`);
      await this.auditAuthEvent("audit:auth.login.failure", {
        userId: null,
        tenantId: null,
        email,
        reason: "user_not_found",
        correlationId: ctx.correlationId,
        ipAddress: ctx.ipAddress,
        userAgentHash: ctx.userAgentHash,
        severity: "warning",
      });
      return failGeneric();
    }

    // Bu noktadan sonra user non-null. TypeScript narrowing için
    // userId alias kullanıyoruz.
    const userId = user.id;
    const userRecord: User = user;

    // Hesap aktif mi?
    if (userRecord.status !== "active") {
      await this.auditAuthEvent("audit:auth.login.failure", {
        userId,
        tenantId: null,
        email,
        reason: "user_suspended",
        correlationId: ctx.correlationId,
        ipAddress: ctx.ipAddress,
        userAgentHash: ctx.userAgentHash,
        severity: "warning",
      });
      return failGeneric();
    }

    // Kilitli mi?
    if (userRecord.lockedUntil && userRecord.lockedUntil > new Date()) {
      await this.auditAuthEvent("audit:auth.login.failure", {
        userId,
        tenantId: null,
        email,
        reason: "user_locked",
        correlationId: ctx.correlationId,
        ipAddress: ctx.ipAddress,
        userAgentHash: ctx.userAgentHash,
        severity: "warning",
      });
      throw new DomainError({
        errorCode: "VET-AUTH-0003",
        message:
          "Hesap geçici olarak kilitli; lütfen daha sonra tekrar deneyin",
        httpStatus: 423,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0003",
        details: {
          remainingSeconds: Math.ceil(
            (userRecord.lockedUntil.getTime() - Date.now()) / 1000,
          ),
        },
      });
    }

    // Parola doğrula.
    const ok = await verifyPassword(input.password, userRecord.passwordHash);
    if (!ok) {
      const newCount = userRecord.failedLoginCount + 1;
      const shouldLock = newCount >= MAX_FAILED_LOGIN_COUNT;
      const lockUntil = shouldLock
        ? new Date(Date.now() + ACCOUNT_LOCK_SECONDS * 1000)
        : null;
      await this.repo.recordFailedLogin(userId, newCount, lockUntil);
      this.bruteForce.recordFailure(`user:${userId}`);

      await this.auditAuthEvent("audit:auth.login.failure", {
        userId,
        tenantId: null,
        email,
        reason: "invalid_password",
        failedCount: newCount,
        locked: shouldLock,
        correlationId: ctx.correlationId,
        ipAddress: ctx.ipAddress,
        userAgentHash: ctx.userAgentHash,
        severity: shouldLock ? "error" : "warning",
      });

      if (shouldLock) {
        throw new DomainError({
          errorCode: "VET-AUTH-0003",
          message: "Çok sayıda hatalı deneme; hesap geçici olarak kilitlendi",
          httpStatus: 423,
          severity: "error",
          i18nKey: "error.VET-AUTH-0003",
          details: { remainingSeconds: ACCOUNT_LOCK_SECONDS },
        });
      }
      return failGeneric();
    }

    // Başarılı: sayacı sıfırla + session oluştur.
    await this.repo.recordSuccessfulLogin(userId);
    this.bruteForce.recordSuccess(`user:${userId}`);
    this.bruteForce.recordSuccess(`email:${email}`);

    // Tenant bağlamı çözümle.
    const tenantCtx = await this.resolveTenantContext(userId, input.tenantSlug);

    // SUPERADMIN ise ve tenantSlug verilmemişse tenant bağlamı null kalır
    // (cross-tenant erişim için tenant başka endpoint'te set edilir).
    // Normal kullanıcılar için tenant bağlamı zorunlu; yoksa login reddedilir.
    if (!tenantCtx && !userRecord.isSuperadmin) {
      await this.auditAuthEvent("audit:auth.login.failure", {
        userId,
        tenantId: null,
        email,
        reason: "no_active_membership",
        correlationId: ctx.correlationId,
        ipAddress: ctx.ipAddress,
        userAgentHash: ctx.userAgentHash,
        severity: "warning",
      });
      throw new DomainError({
        errorCode: "VET-AUTH-0001",
        message: "Hesabınız için aktif bir tenant üyeliği bulunamadı",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    // Tenant'ın varsayılan branch'ını çözümle (pilot tek şube).
    let defaultBranchId: string | null = null;
    if (tenantCtx) {
      const def = await this.repo.findDefaultActiveBranch(tenantCtx.tenantId);
      defaultBranchId = def?.id ?? null;
    }

    const session = await this.createSessionForUserById(
      userId,
      ctx,
      defaultBranchId,
    );

    await this.auditAuthEvent("audit:auth.login.success", {
      userId,
      tenantId: tenantCtx?.tenantId ?? null,
      email,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });

    return {
      sessionToken: session.plainToken,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: userRecord.id,
        email: userRecord.email,
        displayName: userRecord.displayName,
        locale: userRecord.locale,
      },
      tenant: tenantCtx
        ? {
            id: tenantCtx.tenantId,
            slug: tenantCtx.tenantSlug,
            name: tenantCtx.tenantName,
            country: tenantCtx.country,
          }
        : null,
      role: tenantCtx?.role ?? null,
      branchId: defaultBranchId,
    };
  }

  // ===========================================================================
  // LOGOUT
  // ===========================================================================

  public async logout(
    sessionId: string,
    userId: string,
    ctx: AttemptContext,
    revokeAll = false,
  ): Promise<{ revokedAt: string }> {
    if (revokeAll) {
      const count = await this.repo.revokeAllSessions(userId, "logout_all");
      this.logger.log(
        `Kullanıcının tüm session'ları iptal: user=${userId} count=${count}`,
      );
    } else {
      await this.repo.revokeSession(sessionId, userId, "logout");
    }
    await this.auditAuthEvent("audit:auth.logout", {
      userId,
      tenantId: null,
      sessionId,
      revokeAll,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });
    return { revokedAt: new Date().toISOString() };
  }

  // ===========================================================================
  // REFRESH
  // ===========================================================================

  public async refresh(
    currentSessionId: string,
    userId: string,
    ctx: AttemptContext,
  ): Promise<{ sessionToken: string; expiresAt: string }> {
    const newSession = await this.createSessionForUserById(userId, ctx);
    await this.repo.revokeSession(
      currentSessionId,
      userId,
      "rotated",
      newSession.id,
    );

    await this.auditAuthEvent("audit:auth.session.rotate", {
      userId,
      tenantId: null,
      oldSessionId: currentSessionId,
      newSessionId: newSession.id,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });

    return {
      sessionToken: newSession.plainToken,
      expiresAt: newSession.expiresAt.toISOString(),
    };
  }

  // ===========================================================================
  // FORGOT / RESET PASSWORD
  // ===========================================================================

  public async forgotPassword(
    input: ForgotPasswordRequest,
    ctx: AttemptContext,
  ): Promise<{ message: string; resetToken?: string }> {
    const email = input.email.toLowerCase().trim();
    const user = await this.repo.findUserByEmail(email);

    if (!user || user.status !== "active") {
      return {
        message: "Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi",
      };
    }

    const userId = user.id;
    await this.repo.revokePasswordResets(userId);

    const plain = generateToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000);
    await this.repo.createPasswordReset({
      userId,
      tokenHash: hashToken(plain),
      expiresAt,
    });

    await this.auditAuthEvent("audit:auth.password.reset_request", {
      userId,
      tenantId: null,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });

    return {
      message: "Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi",
    };
  }

  public async resetPassword(
    input: ResetPasswordRequest,
    ctx: AttemptContext,
  ): Promise<{ message: string; sessionToken?: string; expiresAt?: string }> {
    const tokenHash = hashToken(input.token);
    const reset = await this.repo.findPasswordResetByTokenHash(tokenHash);
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new DomainError({
        errorCode: "VET-AUTH-0004",
        message: "Sıfırlama token'ı geçersiz veya süresi dolmuş",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0004",
      });
    }

    const user = await this.repo.findUserById(reset.userId);
    if (!user || user.status !== "active") {
      throw new DomainError({
        errorCode: "VET-AUTH-0004",
        message: "Sıfırlama token'ı geçersiz veya süresi dolmuş",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0004",
      });
    }

    const userId = user.id;
    const passwordHash = await hashPassword(input.newPassword);
    await this.repo.updatePassword(userId, passwordHash);
    await this.repo.markPasswordResetUsed(reset.id, userId);
    const revoked = await this.repo.revokeAllSessions(userId, "password_reset");

    await this.auditAuthEvent("audit:auth.password.reset_success", {
      userId,
      tenantId: null,
      sessionsRevoked: revoked,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "warning",
    });

    const session = await this.createSessionForUserById(userId, ctx);

    return {
      message: "Parola güncellendi",
      sessionToken: session.plainToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  public async changePassword(
    userId: string,
    input: ChangePasswordRequest,
    ctx: AttemptContext,
  ): Promise<{ message: string }> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new DomainError({
        errorCode: "VET-AUTH-0001",
        message: "Kimlik doğrulama gerekli",
        httpStatus: 401,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0001",
      });
    }
    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) {
      throw new DomainError({
        errorCode: "VET-AUTH-0002",
        message: "Mevcut parola hatalı",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0002",
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.repo.updatePassword(userId, passwordHash);

    await this.auditAuthEvent("audit:auth.password.change", {
      userId,
      tenantId: null,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });

    return { message: "Parola güncellendi" };
  }

  // ===========================================================================
  // INVITATIONS
  // ===========================================================================

  public async inviteUser(
    tenantId: string,
    input: InviteUserRequest,
    invitedBy: string,
    ctx: AttemptContext,
  ): Promise<{
    invitationId: string;
    email: string;
    role: string;
    expiresAt: string;
    invitationUrl: string;
  }> {
    const existing = await this.repo.findPendingInvitation(
      tenantId,
      input.email,
    );
    if (existing) {
      throw new DomainError({
        errorCode: "VET-AUTH-0005",
        message: "Bu e-posta için bekleyen davet zaten var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0005",
      });
    }

    const plain = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_SECONDS * 1000);
    const invitation = await this.repo.createInvitation({
      tenantId,
      email: input.email,
      role: input.role,
      tokenHash: hashToken(plain),
      invitedBy,
      expiresAt,
    });

    await this.auditAuthEvent("audit:auth.invitation.create", {
      userId: invitedBy,
      tenantId,
      invitationId: invitation.id,
      email: input.email,
      role: input.role,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });

    return {
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      invitationUrl: `/invitations/accept?token=${plain}`,
    };
  }

  public async acceptInvitation(
    input: AcceptInvitationRequest,
    ctx: AttemptContext,
  ): Promise<LoginResponse> {
    const tokenHash = hashToken(input.token);
    const invitation = await this.repo.findInvitationByTokenHash(tokenHash);
    if (!invitation || invitation.status !== "pending") {
      throw new DomainError({
        errorCode: "VET-AUTH-0005",
        message: "Davet geçersiz veya süresi dolmuş",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0005",
      });
    }
    if (invitation.expiresAt < new Date()) {
      await this.repo.updateInvitation(invitation.tenantId, invitation.id, {
        status: "expired",
      });
      throw new DomainError({
        errorCode: "VET-AUTH-0005",
        message: "Davet geçersiz veya süresi dolmuş",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0005",
      });
    }

    let user = await this.repo.findUserByEmail(invitation.email);
    if (!user) {
      const passwordHash = await hashPassword(input.password);
      user = await this.repo.createUser({
        email: invitation.email,
        passwordHash,
        displayName: input.displayName,
        locale: input.locale,
      });
    } else {
      const passwordHash = await hashPassword(input.password);
      await this.repo.updatePassword(user.id, passwordHash);
    }

    const userId = user.id;
    await this.repo.upsertMembershipForTenant({
      userId,
      tenantId: invitation.tenantId,
      role: invitation.role,
    });

    await this.repo.updateInvitation(invitation.tenantId, invitation.id, {
      status: "accepted",
      acceptedAt: new Date(),
    });

    const session = await this.createSessionForUserById(userId, ctx);

    await this.auditAuthEvent("audit:auth.invitation.accept", {
      userId,
      tenantId: invitation.tenantId,
      invitationId: invitation.id,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });

    const tenant = await this.tenants.findById(invitation.tenantId);

    return {
      sessionToken: session.plainToken,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        locale: user.locale,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            country: tenant.country,
          }
        : null,
      role: actorRoleSchema.parse(invitation.role),
      branchId: null,
    };
  }

  // ===========================================================================
  // ME
  // ===========================================================================

  public async me(userId: string, sessionId: string): Promise<MeResponse> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new DomainError({
        errorCode: "VET-AUTH-0001",
        message: "Kimlik doğrulama gerekli",
        httpStatus: 401,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0001",
      });
    }
    const session = await this.repo.findSessionByIdForUser(sessionId, userId);
    if (!session) {
      throw new DomainError({
        errorCode: "VET-AUTH-0001",
        message: "Oturum geçersiz",
        httpStatus: 401,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0001",
      });
    }
    const memberships = await this.repo.listActiveMembershipsWithTenant(userId);
    // İlk aktif üyelik varsa tenant + role + branch çözümle.
    const first = memberships[0];
    let tenant: MeResponse["tenant"] = null;
    let role: MeResponse["role"] = null;
    if (first) {
      tenant = {
        id: first.tenant.id,
        slug: first.tenant.slug,
        name: first.tenant.name,
        country: first.tenant.country,
        defaultLocale: first.tenant.defaultLocale,
        timezone: first.tenant.timezone,
      };
      role = actorRoleSchema.parse(first.role);
    } else if (user.isSuperadmin) {
      role = "SUPERADMIN";
    }
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        locale: user.locale,
        status: user.status,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        ipAddress: session.ipAddress,
      },
      tenant,
      role,
      branchId: session.activeBranchId ?? null,
      memberships: memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantSlug: m.tenant.slug,
        tenantName: m.tenant.name,
        role: actorRoleSchema.parse(m.role),
        status: m.status,
      })),
    };
  }

  /**
   * Aktif branch'ı değiştirir (multi-branch tenant senaryosu). Kullanıcı
   * yalnızca kendi tenant'ının branch'larına geçebilir. Branch
   * değişikliği audit log'a yazılır.
   *
   * SUPERADMIN kullanıcılar için herhangi bir tenant'ın branch'ına
   * geçiş kabul edilir (cross-tenant görünüm).
   * @param userId
   * @param sessionId
   * @param branchId
   * @param isSuperadmin
   * @param ctx
   */
  public async setActiveBranch(
    userId: string,
    sessionId: string,
    branchId: string,
    isSuperadmin: boolean,
    ctx: AttemptContext,
  ): Promise<{ branchId: string }> {
    const branch = await this.repo.findActiveBranchForUser(
      userId,
      branchId,
      isSuperadmin,
    );
    if (!branch || branch.archivedAt) {
      throw new DomainError({
        errorCode: "VET-BRANCH-0001",
        message: "Şube bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-BRANCH-0001",
      });
    }
    await this.repo.setSessionActiveBranch(sessionId, userId, branchId);
    await this.auditAuthEvent("audit:auth.branch.switch", {
      userId,
      tenantId: branch.tenantId,
      sessionId,
      branchId,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });
    return { branchId };
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  public async validateSession(token: string): Promise<{
    userId: string;
    sessionId: string;
    expiresAt: Date;
    activeBranchId: string | null;
  } | null> {
    const tokenHash = hashToken(token);
    const session = await this.repo.findSessionByTokenHash(tokenHash);
    if (!session || session.revokedAt) return null;
    if (session.expiresAt < new Date()) return null;

    // Idle timeout kontrolü.
    const idleMs = Date.now() - session.lastUsedAt.getTime();
    if (idleMs > SESSION_IDLE_TIMEOUT_SECONDS * 1000) {
      await this.repo.revokeSession(session.id, session.userId, "idle_timeout");
      return null;
    }

    // Hesap hâlâ aktif mi? (kullanıcı suspend edilmiş olabilir).
    const user = await this.repo.findUserById(session.userId);
    if (!user || user.status !== "active") {
      await this.repo.revokeSession(
        session.id,
        session.userId,
        "user_inactive",
      );
      return null;
    }

    // lastUsedAt güncelle (fire-and-forget).
    void this.repo.touchSession(session.id, session.userId, new Date());

    return {
      userId: session.userId,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      activeBranchId: session.activeBranchId ?? null,
    };
  }

  public async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<
    Array<{
      id: string;
      expiresAt: string;
      lastUsedAt: string;
      createdAt: string;
      ipAddress: string | null;
      isCurrent: boolean;
      revokedAt: string | null;
    }>
  > {
    const sessions = await this.repo.listAllSessions(userId);
    return sessions.map((s) => ({
      id: s.id,
      expiresAt: s.expiresAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      ipAddress: s.ipAddress,
      isCurrent: s.id === currentSessionId,
      revokedAt: s.revokedAt?.toISOString() ?? null,
    }));
  }

  public async revokeSessionById(
    sessionId: string,
    userId: string,
    ctx: AttemptContext,
  ): Promise<void> {
    const target = await this.repo.findSessionByIdForUser(sessionId, userId);
    if (!target || target.userId !== userId) {
      throw new DomainError({
        errorCode: "VET-AUTH-0001",
        message: "Oturum bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0001",
      });
    }
    await this.repo.revokeSession(sessionId, userId, "user_revoked");
    await this.auditAuthEvent("audit:auth.session.revoke", {
      userId,
      tenantId: null,
      sessionId,
      correlationId: ctx.correlationId,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      severity: "info",
    });
  }

  // ===========================================================================
  // TENANT SWITCH
  // ===========================================================================

  public async switchTenant(
    userId: string,
    input: SwitchTenantRequest,
  ): Promise<{ tenantId: string; role: string }> {
    const membership = await this.repo.findActiveMembershipWithTenant(
      userId,
      input.tenantSlug,
    );
    if (!membership) {
      throw new DomainError({
        errorCode: "VET-AUTH-0001",
        message: "Bu tenant'a erişim yetkiniz yok",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0001",
      });
    }
    return { tenantId: membership.tenantId, role: membership.role };
  }

  // ===========================================================================
  // ACTOR CONTEXT (AuthGuard)
  // ===========================================================================

  /**
   * AuthGuard tarafından her istek başında çağrılır; actor bilgisini
   * çözer. SUPERADMIN kullanıcılar için tenantId null döner (cross-tenant
   * erişim). Normal kullanıcılar için ilk aktif üyeliğin tenant'ı
   * kullanılır.
   *
   * `isSuperadmin` bayrağı user tablosundan okunur; tenant üyeliği
   * gerektirmez. GOAL-012 ile birlikte.
   * @param userId
   */
  public async resolveActorContext(userId: string): Promise<{
    role: ActorRole;
    tenantId: string | null;
    isSuperadmin: boolean;
  }> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      return { role: "STAFF", tenantId: null, isSuperadmin: false };
    }
    if (user.isSuperadmin) {
      return { role: "SUPERADMIN", tenantId: null, isSuperadmin: true };
    }
    const first = await this.repo.findActiveMembershipWithTenant(userId);
    if (!first) {
      return { role: "STAFF", tenantId: null, isSuperadmin: false };
    }
    return {
      role: first.role as ActorRole,
      tenantId: first.tenantId,
      isSuperadmin: false,
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Yeni session oluşturur; plain token'ı da döner. DB'ye
   * tokenHash yazılır; caller plain token'ı response'a koyar.
   * GOAL-012: `activeBranchId` opsiyonel olarak set edilir; pilot
   * tenant tek şube ile başladığı için login sırasında default
   * branch atanır.
   * @param userId
   * @param ctx
   * @param activeBranchId
   */
  private async createSessionForUserById(
    userId: string,
    ctx: AttemptContext,
    activeBranchId: string | null = null,
  ): Promise<{
    id: string;
    plainToken: string;
    expiresAt: Date;
  }> {
    const plain = generateToken();
    const tokenHash = hashToken(plain);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    const session = await this.repo.createSession({
      userId,
      tokenHash,
      expiresAt,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      activeBranchId,
    });
    return {
      id: session.id,
      plainToken: plain,
      expiresAt: session.expiresAt,
    };
  }

  private async resolveTenantContext(
    userId: string,
    tenantSlug?: string,
  ): Promise<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    country: string;
    role: ActorRole;
  } | null> {
    const membership = await this.repo.findActiveMembershipWithTenant(
      userId,
      tenantSlug,
    );
    if (!membership) return null;
    return {
      tenantId: membership.tenantId,
      tenantSlug: membership.tenant.slug,
      tenantName: membership.tenant.name,
      country: membership.tenant.country,
      role: membership.role as ActorRole,
    };
  }

  private async auditAuthEvent(
    eventName: string,
    details: {
      userId: string | null;
      tenantId: string | null;
      [k: string]: unknown;
    },
  ): Promise<void> {
    const correlationId = (details["correlationId"] as string) ?? "req-unknown";
    const ipAddress = (details["ipAddress"] as string | null) ?? null;
    const userAgentHash = (details["userAgentHash"] as string | null) ?? null;
    const severity = ((details["severity"] as string) ?? "info") as
      "info" | "warning" | "error" | "critical";

    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(details)) {
      if (
        ["correlationId", "ipAddress", "userAgentHash", "severity"].includes(k)
      )
        continue;
      Object.defineProperty(metadata, k, {
        value: v,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    await this.audit.record({
      eventName,
      tenantId: details.tenantId,
      branchId: null,
      actorId: details.userId,
      actorType: "user",
      targetType: eventName.startsWith("audit:auth.invitation")
        ? "invitation"
        : "user",
      targetId:
        (details["userId"] as string) ??
        (details["invitationId"] as string) ??
        "auth",
      action:
        eventName.endsWith("create") || eventName.endsWith("success")
          ? "create"
          : eventName.endsWith("update")
            ? "update"
            : "read",
      correlationId,
      country: "TR",
      severity,
      ipAddress,
      userAgentHash,
      after: this.maskPayload(metadata),
    });
  }

  private maskPayload(
    payload: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!payload) return null;
    return this.masker.mask(payload);
  }

  /**
   * Sistem için actor context factory.
   * @param correlationId
   */
  public systemActor(correlationId: string): ActorContext {
    return {
      actorId: null,
      actorType: "system",
      role: "SYSTEM",
      tenantId: null,
      branchId: null,
      isSuperadmin: false,
      correlationId,
      ipAddress: null,
      userAgentHash: null,
      source: "system",
    };
  }
}
