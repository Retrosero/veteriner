/**
 * @file Portal auth repository (in-memory).
 * @module apps/api/modules/portal-auth/portal-auth.repository
 *
 * @description GOAL-033 portal auth veri erişim katmanı. PortalUser
 * (parola + brute-force sayaç), portal session'ları, parola
 * sıfırlama token'ları ve email doğrulama token'ları için
 * in-memory store. DB migration'ı sonraya bırakıldı; API sözleşmesi
 * sabit kalır.
 *
 * Veri yapıları:
 * - `portalUsers`        : tenantId|portalUserId → PortalUserRecord
 * - `byEmail`            : tenantId|email → portalUserId (login lookup)
 * - `byInvitationId`     : invitationId → portalUserId (GOAL-025 → 033 bağı)
 * - `sessions`           : sessionToken → PortalSessionRecord
 * - `userSessions`       : portalUserId → Set<sessionToken> (logout-all)
 * - `resetTokens`        : tokenHash → PortalPasswordResetRecord
 * - `emailVerifications` : tokenHash → PortalEmailVerificationRecord
 *
 * @security
 * - Tüm aramalar tenantId ile filtrelenir.
 * - Parola bcrypt ile hash'lenir; plain asla store edilmez.
 * - Session/email/reset token'ları plain response prensibiyle çalışır;
 *   DB'ye geçişte SHA-256 hash + plain response prensibi uygulanmalıdır.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal kayıt ve giriş
 */

import { Injectable } from "@nestjs/common";

import type {
  PortalEmailVerificationRecord,
  PortalPasswordResetRecord,
  PortalSessionRecord,
  PortalUserRecord,
} from "./portal-auth.types.js";

@Injectable()
export class PortalAuthRepository {
  /** key: tenantId|portalUserId → PortalUserRecord. */
  private readonly portalUsers = new Map<string, PortalUserRecord>();
  /** key: tenantId|emailLower → portalUserId. */
  private readonly byEmail = new Map<string, string>();
  /** key: invitationId → portalUserId (davet kabul → portal user bağı). */
  private readonly byInvitationId = new Map<string, string>();
  /** key: sessionToken → PortalSessionRecord. */
  private readonly sessions = new Map<string, PortalSessionRecord>();
  /** key: portalUserId → Set<sessionToken>. */
  private readonly userSessions = new Map<string, Set<string>>();
  /** key: tokenHash → reset record. */
  private readonly resetTokens = new Map<string, PortalPasswordResetRecord>();
  /** key: tokenHash → email verification record. */
  private readonly emailVerifications = new Map<
    string,
    PortalEmailVerificationRecord
  >();
  /** Her tenant için portalUserId counter. */
  private readonly userCounters = new Map<string, number>();

  // ===========================================================================
  // PORTAL USER
  // ===========================================================================

  public nextPortalUserId(tenantId: string): string {
    const n = (this.userCounters.get(tenantId) ?? 0) + 1;
    this.userCounters.set(tenantId, n);
    return `pusr-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insertPortalUser(record: PortalUserRecord): PortalUserRecord {
    this.portalUsers.set(`${record.tenantId}|${record.id}`, record);
    this.byEmail.set(
      `${record.tenantId}|${record.email.toLowerCase()}`,
      record.id,
    );
    if (record.invitationId) {
      this.byInvitationId.set(record.invitationId, record.id);
    }
    return record;
  }

  public findPortalUserById(
    tenantId: string,
    portalUserId: string,
  ): PortalUserRecord | null {
    return this.portalUsers.get(`${tenantId}|${portalUserId}`) ?? null;
  }

  public findPortalUserByEmail(
    tenantId: string,
    email: string,
  ): PortalUserRecord | null {
    const id = this.byEmail.get(`${tenantId}|${email.toLowerCase()}`);
    if (!id) return null;
    return this.findPortalUserById(tenantId, id);
  }

  /** Tenant-agnostic ID lookup (invitation accept sonrası gibi). */
  public findPortalUserByIdGlobal(portalUserId: string): PortalUserRecord | null {
    for (const rec of this.portalUsers.values()) {
      if (rec.id === portalUserId) return rec;
    }
    return null;
  }

  public updatePortalUser(record: PortalUserRecord): PortalUserRecord {
    this.portalUsers.set(`${record.tenantId}|${record.id}`, record);
    this.byEmail.set(
      `${record.tenantId}|${record.email.toLowerCase()}`,
      record.id,
    );
    if (record.invitationId) {
      this.byInvitationId.set(record.invitationId, record.id);
    }
    return record;
  }

  /** Davet ID ile portal user'ı bulur (cross-tenant lookup). */
  public findPortalUserByInvitationId(
    invitationId: string,
  ): PortalUserRecord | null {
    const id = this.byInvitationId.get(invitationId);
    if (!id) return null;
    for (const rec of this.portalUsers.values()) {
      if (rec.id === id) return rec;
    }
    return null;
  }

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  public insertSession(record: PortalSessionRecord): void {
    this.sessions.set(record.sessionToken, record);
    const set = this.userSessions.get(record.portalUserId) ?? new Set();
    set.add(record.sessionToken);
    this.userSessions.set(record.portalUserId, set);
  }

  public findSession(token: string): PortalSessionRecord | null {
    return this.sessions.get(token) ?? null;
  }

  public deleteSession(token: string): void {
    const rec = this.sessions.get(token);
    if (!rec) return;
    this.sessions.delete(token);
    const set = this.userSessions.get(rec.portalUserId);
    set?.delete(token);
  }

  // ===========================================================================
  // PASSWORD RESET TOKENS
  // ===========================================================================

  public insertResetToken(record: PortalPasswordResetRecord): void {
    this.resetTokens.set(record.tokenHash, record);
  }

  public findResetToken(tokenHash: string): PortalPasswordResetRecord | null {
    return this.resetTokens.get(tokenHash) ?? null;
  }

  public consumeResetToken(tokenHash: string): void {
    this.resetTokens.delete(tokenHash);
  }

  // ===========================================================================
  // EMAIL VERIFICATION TOKENS
  // ===========================================================================

  public insertEmailVerification(
    record: PortalEmailVerificationRecord,
  ): void {
    this.emailVerifications.set(record.tokenHash, record);
  }

  public findEmailVerification(
    tokenHash: string,
  ): PortalEmailVerificationRecord | null {
    return this.emailVerifications.get(tokenHash) ?? null;
  }

  public consumeEmailVerification(tokenHash: string): void {
    this.emailVerifications.delete(tokenHash);
  }

  /** Kullanıcının tüm bekleyen email verification token'larını siler
   *  (yeni token üretildiğinde eskiyi geçersiz kılmak için). */
  public revokeAllEmailVerifications(portalUserId: string): void {
    for (const [hash, rec] of this.emailVerifications.entries()) {
      if (rec.portalUserId === portalUserId) {
        this.emailVerifications.delete(hash);
      }
    }
  }

  // ===========================================================================
  // TEST HELPERS
  // ===========================================================================

  public clear(): void {
    this.portalUsers.clear();
    this.byEmail.clear();
    this.byInvitationId.clear();
    this.sessions.clear();
    this.userSessions.clear();
    this.resetTokens.clear();
    this.emailVerifications.clear();
    this.userCounters.clear();
  }
}
