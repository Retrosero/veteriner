/**
 * @file Portal auth repository (in-memory).
 * @module apps/api/modules/portal-auth/portal-auth.repository
 *
 * @description GOAL-033 portal auth veri erişim katmanı. PortalUser
 * (parola + brute-force sayaç), portal session'ları ve parola
 * sıfırlama token'ları için in-memory store. DB migration'ı
 * sonraya bırakıldı; API sözleşmesi sabit kalır.
 *
 * Veri yapıları:
 * - `portalUsers`  : tenantId|portalUserId → PortalUserRecord
 * - `byEmail`      : tenantId|email → portalUserId (login lookup)
 * - `sessions`     : sessionToken → PortalSessionRecord
 * - `userSessions` : portalUserId → Set<sessionToken> (logout-all)
 * - `resetTokens`  : tokenHash → PortalPasswordResetRecord
 *
 * @security
 * - Tüm aramalar tenantId ile filtrelenir.
 * - Parola bcrypt ile hash'lenir; plain asla store edilmez.
 * - Session token'ları plain (response'da döner); DB'ye geçildiğinde
 *   SHA-256 hash + plain response prensibi uygulanmalıdır.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal kayıt ve giriş
 */

import { Injectable } from "@nestjs/common";

import type {
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
  /** key: sessionToken → PortalSessionRecord. */
  private readonly sessions = new Map<string, PortalSessionRecord>();
  /** key: portalUserId → Set<sessionToken>. */
  private readonly userSessions = new Map<string, Set<string>>();
  /** key: tokenHash → reset record. */
  private readonly resetTokens = new Map<string, PortalPasswordResetRecord>();
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
    return record;
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
  // TEST HELPERS
  // ===========================================================================

  public clear(): void {
    this.portalUsers.clear();
    this.byEmail.clear();
    this.sessions.clear();
    this.userSessions.clear();
    this.resetTokens.clear();
    this.userCounters.clear();
  }
}
