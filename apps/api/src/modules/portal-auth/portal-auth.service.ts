/**
 * @file Portal kimlik doğrulama service.
 * @module apps/api/modules/portal-auth/portal-auth.service
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş
 * iş kuralları. Personel auth'undan ayrı bir path; in-memory
 * repository üzerinde çalışır (DB migration sonraya bırakıldı).
 *
 * İş kuralları:
 * - register: tenant + email + ownerId + parola. Aynı email
 *   kayıtlıysa 409 VET-AUTH-0003. KVKK consent zorunlu (true
 *   değilse 422 VET-VALIDATION-0003). bcrypt cost 12.
 *   Audit: `audit:portal.auth.register` (info).
 * - login: tenantId + email + parola. Brute-force: 5 yanlış
 *   deneme → 15 dakika hesap kilidi (failedLoginCount +
 *   lockedUntil). Kilit süresi içindeyse 423 VET-AUTH-0005.
 *   Email yoksa timing-equalize + generic hata (VET-AUTH-0002).
 *   Audit: `audit:portal.auth.login.success` (info) veya
 *   `audit:portal.auth.login.failure` (warning).
 * - validateSession: token → PortalUser | null. Süresi geçmişse
 *   null.
 * - logout: session sil. Audit `audit:portal.auth.logout`.
 * - requestPasswordReset: token üret (1 saat geçerli). Response
 *   debug amaçlı token döner (FAZ-0); FAZ-3+'da email ile.
 *   Audit: `audit:portal.auth.password.reset_request` (info).
 * - confirmPasswordReset: token doğrula + süre + kullanılmamış;
 *   yeni parola hash'le. Audit:
 *   `audit:portal.auth.password.reset_success` (info).
 *
 * @security
 * - Parola bcrypt cost 12; plain asla loglanmaz.
 * - Login hata mesajı sabit ("E-posta veya parola hatalı").
 * - Forgot password response her durumda OK (email enumeration
 *   koruması); token yalnızca kullanıcı var ise döner.
 * - Tüm auth event'leri audit_events'e yazılır; PII PiiMasker
 *   üzerinden maskelenir.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal hesap kayıt ve giriş
 */

import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";

import {
  ACCOUNT_LOCK_SECONDS,
  BCRYPT_COST,
  MAX_FAILED_LOGIN_COUNT,
  PASSWORD_RESET_TTL_SECONDS,
  PORTAL_SESSION_TTL_SECONDS,
} from "@vetniva/contracts";

import { AuditService } from "../../common/audit/audit.service.js";
import { hashPassword, verifyPassword } from "../../common/auth/password.js";
import { DomainError } from "../../common/errors/domain-error.js";

import { PortalAuthRepository } from "./portal-auth.repository.js";
import type {
  PortalAttemptContext,
  PortalLoginInput,
  PortalPasswordResetRecord,
  PortalSession,
  PortalUser,
} from "./portal-auth.types.js";

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  public constructor(
    private readonly repo: PortalAuthRepository,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // REGISTER
  // ===========================================================================

  public async register(
    tenantId: string,
    input: {
      email: string;
      password: string;
      ownerId: string;
      consentKvkk: boolean;
      displayName?: string;
      locale?: "tr-TR" | "en-GB";
    },
    ctx: PortalAttemptContext,
  ): Promise<PortalUser> {
    // 1) KVKK consent zorunlu.
    if (input.consentKvkk !== true) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0003",
        message: "KVKK açık rıza onayı zorunludur",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0003",
        details: { field: "consentKvkk" },
      });
    }

    const email = input.email.trim().toLowerCase();

    // 2) Email zaten kayıtlı mı?
    if (this.repo.findPortalUserByEmail(tenantId, email)) {
      throw new DomainError({
        errorCode: "VET-AUTH-0003",
        message: "Bu e-posta ile kayıtlı portal hesabı zaten var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0003",
        details: { email },
      });
    }

    // 3) Parola hash.
    const passwordHash = await hashPassword(input.password);

    // 4) Kayıt oluştur.
    const now = new Date();
    const id = this.repo.nextPortalUserId(tenantId);
    const record = this.repo.insertPortalUser({
      id,
      tenantId,
      ownerId: input.ownerId,
      email,
      passwordHash,
      status: "active",
      consentKvkk: true,
      consentKvkkAt: now.toISOString(),
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now.toISOString(),
      lastLoginAt: null,
      patientIds: [],
      displayName: input.displayName ?? null,
      locale: input.locale ?? "tr-TR",
    });

    // 5) Audit.
    await this.audit.record({
      eventName: "audit:portal.auth.register",
      tenantId,
      actorId: id,
      actorType: "portal_user",
      targetType: "portal_user",
      targetId: id,
      action: "create",
      correlationId: ctx.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
      after: {
        ownerId: input.ownerId,
        locale: record.locale,
        consentKvkkAt: record.consentKvkkAt,
      },
      metadata: { source: "portal_register" },
    });

    return this.toPortalUser(record);
  }

  // ===========================================================================
  // LOGIN
  // ===========================================================================

  public async login(
    tenantId: string,
    input: PortalLoginInput,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ user: PortalUser; session: PortalSession }> {
    const email = input.email.trim().toLowerCase();
    const ctx: PortalAttemptContext = {
      ipAddress: ip,
      userAgentHash: this.hashUserAgent(userAgent),
      correlationId: `req-portal-${Date.now()}`,
    };

    const user = this.repo.findPortalUserByEmail(tenantId, email);

    // Hata mesajı sabit — email enumeration koruması.
    const failGeneric = (): never => {
      throw new DomainError({
        errorCode: "VET-AUTH-0002",
        message: "E-posta veya parola hatalı",
        httpStatus: 401,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0002",
      });
    };

    // 1) Bilinmeyen email → timing-equalize + generic hata.
    if (!user) {
      await hashPassword("decoy-password-for-timing-equalization");
      await this.auditPortalAuthEvent("audit:portal.auth.login.failure", {
        ctx,
        email,
        reason: "user_not_found",
        severity: "warning",
        tenantId,
        portalUserId: null,
      });
      throw failGeneric();
    }

    // 2) Hesap kilitli mi?
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      await this.auditPortalAuthEvent("audit:portal.auth.login.failure", {
        ctx,
        email,
        reason: "user_locked",
        severity: "warning",
        tenantId,
        portalUserId: user.id,
      });
      throw new DomainError({
        errorCode: "VET-AUTH-0005",
        message: "Hesap geçici olarak kilitli; lütfen daha sonra tekrar deneyin",
        httpStatus: 423,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0005",
        details: {
          remainingSeconds: Math.ceil(
            (new Date(user.lockedUntil).getTime() - Date.now()) / 1000,
          ),
        },
      });
    }

    // 3) KVKK consent kontrolü (sentinel).
    if (!user.consentKvkk) {
      await this.auditPortalAuthEvent("audit:portal.auth.login.failure", {
        ctx,
        email,
        reason: "consent_missing",
        severity: "warning",
        tenantId,
        portalUserId: user.id,
      });
      throw new DomainError({
        errorCode: "VET-VALIDATION-0003",
        message: "KVKK açık rıza onayı bulunamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0003",
      });
    }

    // 4) Parola set edilmemişse (pending_password).
    if (!user.passwordHash || user.status === "pending_password") {
      await this.auditPortalAuthEvent("audit:portal.auth.login.failure", {
        ctx,
        email,
        reason: "password_not_set",
        severity: "warning",
        tenantId,
        portalUserId: user.id,
      });
      throw failGeneric();
    }

    // 5) Parola doğrula.
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      const newCount = user.failedLoginCount + 1;
      const shouldLock = newCount >= MAX_FAILED_LOGIN_COUNT;
      const lockUntil = shouldLock
        ? new Date(Date.now() + ACCOUNT_LOCK_SECONDS * 1000).toISOString()
        : null;
      this.repo.updatePortalUser({
        ...user,
        failedLoginCount: newCount,
        lockedUntil: lockUntil,
        status: shouldLock ? "locked" : user.status,
      });
      await this.auditPortalAuthEvent("audit:portal.auth.login.failure", {
        ctx,
        email,
        reason: "invalid_password",
        severity: shouldLock ? "error" : "warning",
        tenantId,
        portalUserId: user.id,
        extra: { failedCount: newCount, locked: shouldLock },
      });
      if (shouldLock) {
        throw new DomainError({
          errorCode: "VET-AUTH-0005",
          message: "Çok sayıda hatalı deneme; hesap 15 dakika kilitlendi",
          httpStatus: 423,
          severity: "error",
          i18nKey: "error.VET-AUTH-0005",
          details: { remainingSeconds: ACCOUNT_LOCK_SECONDS },
        });
      }
      throw failGeneric();
    }

    // 6) Başarılı: sayacı sıfırla + lastLoginAt.
    const lastLoginAt = new Date().toISOString();
    const updated = this.repo.updatePortalUser({
      ...user,
      failedLoginCount: 0,
      lockedUntil: null,
      status: "active",
      lastLoginAt,
    });

    // 7) Session oluştur.
    const sessionToken = randomUUID();
    const nowMs = Date.now();
    const session = {
      sessionToken,
      portalUserId: user.id,
      tenantId,
      createdAt: nowMs,
      expiresAt: nowMs + PORTAL_SESSION_TTL_SECONDS * 1000,
      lastActivityAt: nowMs,
      ipAddress: ctx.ipAddress,
      userAgentHash: ctx.userAgentHash,
    };
    this.repo.insertSession(session);

    await this.auditPortalAuthEvent("audit:portal.auth.login.success", {
      ctx,
      email,
      reason: null,
      severity: "info",
      tenantId,
      portalUserId: user.id,
    });

    return {
      user: this.toPortalUser(updated),
      session: this.toPortalSession(session),
    };
  }

  // ===========================================================================
  // VALIDATE SESSION
  // ===========================================================================

  public async validateSession(token: string): Promise<PortalUser | null> {
    const rec = this.repo.findSession(token);
    if (!rec) return null;
    if (rec.expiresAt <= Date.now()) {
      this.repo.deleteSession(token);
      return null;
    }
    const user = this.repo.findPortalUserById(rec.tenantId, rec.portalUserId);
    if (!user) return null;
    return this.toPortalUser(user);
  }

  // ===========================================================================
  // LOGOUT
  // ===========================================================================

  public async logout(
    token: string,
    ctx: PortalAttemptContext,
  ): Promise<void> {
    const rec = this.repo.findSession(token);
    if (!rec) {
      // Idempotent: session yoksa yine OK.
      return;
    }
    this.repo.deleteSession(token);
    await this.auditPortalAuthEvent("audit:portal.auth.logout", {
      ctx,
      email: null,
      reason: null,
      severity: "info",
      tenantId: rec.tenantId,
      portalUserId: rec.portalUserId,
    });
  }

  // ===========================================================================
  // FORGOT / RESET PASSWORD
  // ===========================================================================

  /**
   * Parola sıfırlama token'ı oluşturur. Email var ise token üretir
   * (response'a döner; FAZ-0 debug); yoksa generic OK döner
   * (enumeration koruması).
   */
  public async requestPasswordReset(
    tenantId: string,
    email: string,
    ctx: PortalAttemptContext,
  ): Promise<{ message: string; resetToken?: string }> {
    const normalized = email.trim().toLowerCase();
    const user = this.repo.findPortalUserByEmail(tenantId, normalized);

    if (!user) {
      // Email enumeration koruması: yine de generic mesaj.
      return {
        message: "Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi",
      };
    }

    const plain = this.generatePlainToken();
    const tokenHash = this.hashToken(plain);
    const now = Date.now();
    const record: PortalPasswordResetRecord = {
      tokenHash,
      portalUserId: user.id,
      tenantId,
      createdAt: now,
      expiresAt: now + PASSWORD_RESET_TTL_SECONDS * 1000,
      usedAt: null,
    };
    this.repo.insertResetToken(record);

    await this.auditPortalAuthEvent("audit:portal.auth.password.reset_request", {
      ctx,
      email: normalized,
      reason: null,
      severity: "info",
      tenantId,
      portalUserId: user.id,
    });

    // FAZ-0: debug için token response'a ekleniyor; FAZ-3+'da email
    // ile gönderilecek (notification GOAL-015 entegrasyonu).
    return {
      message: "Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi",
      resetToken: plain,
    };
  }

  /**
   * Token ile parolayı sıfırlar. Token geçerli, süresi geçmemiş
   * ve kullanılmamış olmalı. Yeni parola bcrypt ile hash'lenir.
   */
  public async confirmPasswordReset(
    token: string,
    newPassword: string,
    ctx: PortalAttemptContext,
  ): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);
    const rec = this.repo.findResetToken(tokenHash);
    if (!rec || rec.usedAt || rec.expiresAt <= Date.now()) {
      throw new DomainError({
        errorCode: "VET-AUTH-0004",
        message: "Sıfırlama token'ı geçersiz veya süresi dolmuş",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0004",
      });
    }

    const user = this.repo.findPortalUserById(rec.tenantId, rec.portalUserId);
    if (!user) {
      throw new DomainError({
        errorCode: "VET-AUTH-0004",
        message: "Sıfırlama token'ı geçersiz veya süresi dolmuş",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0004",
      });
    }

    const passwordHash = await hashPassword(newPassword);
    this.repo.updatePortalUser({
      ...user,
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
      status: "active",
    });
    this.repo.consumeResetToken(tokenHash);

    await this.auditPortalAuthEvent("audit:portal.auth.password.reset_success", {
      ctx,
      email: user.email,
      reason: null,
      severity: "info",
      tenantId: rec.tenantId,
      portalUserId: user.id,
    });

    return { message: "Parola güncellendi" };
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  private toPortalUser(record: {
    id: string;
    tenantId: string;
    ownerId: string;
    email: string;
    status: "active" | "locked" | "pending_password";
    failedLoginCount: number;
    lockedUntil: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  }): PortalUser {
    const out: PortalUser = {
      id: record.id,
      tenantId: record.tenantId,
      ownerId: record.ownerId,
      email: record.email,
      status: record.status,
      failedLoginCount: record.failedLoginCount,
      createdAt: record.createdAt,
    };
    if (record.lockedUntil) out.lockedUntil = record.lockedUntil;
    if (record.lastLoginAt) out.lastLoginAt = record.lastLoginAt;
    return out;
  }

  private toPortalSession(rec: {
    sessionToken: string;
    portalUserId: string;
    tenantId: string;
    createdAt: number;
    expiresAt: number;
    lastActivityAt: number;
    ipAddress: string | null;
    userAgentHash: string | null;
  }): PortalSession {
    return {
      id: rec.sessionToken,
      userId: rec.portalUserId,
      token: rec.sessionToken,
      expiresAt: new Date(rec.expiresAt).toISOString(),
      ipAddress: rec.ipAddress,
      userAgent: rec.userAgentHash,
    };
  }

  private generatePlainToken(): string {
    return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  }

  private hashToken(plain: string): string {
    return createHash("sha256").update(plain, "utf8").digest("hex");
  }

  private hashUserAgent(ua: string | null): string | null {
    if (!ua) return null;
    return createHash("sha256").update(ua, "utf8").digest("hex").slice(0, 32);
  }

  private async auditPortalAuthEvent(
    eventName: string,
    payload: {
      ctx: PortalAttemptContext;
      email: string | null;
      reason: string | null;
      severity: "info" | "warning" | "error" | "critical";
      tenantId: string | null;
      portalUserId: string | null;
      extra?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.audit.record({
      eventName,
      tenantId: payload.tenantId,
      actorId: payload.portalUserId,
      actorType: "portal_user",
      targetType: "portal_session",
      targetId: payload.portalUserId ?? "anonymous",
      action: eventName.endsWith("success") || eventName.endsWith("register")
        ? "create"
        : eventName.endsWith("logout") || eventName.endsWith("reset_success")
          ? "complete"
          : "read",
      correlationId: payload.ctx.correlationId,
      country: "TR",
      severity: payload.severity,
      ipAddress: payload.ctx.ipAddress,
      userAgentHash: payload.ctx.userAgentHash,
      after: {
        email: payload.email,
        reason: payload.reason,
        ...(payload.extra ?? {}),
      },
      metadata: { source: "portal_auth" },
    });
  }

  /** Bcrypt cost erişimi (testlerde override için). */
  public static readonly BCRYPT_COST_USED = BCRYPT_COST;
}
