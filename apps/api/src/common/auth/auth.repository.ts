/**
 * @file Auth repository.
 * @module apps/api/common/auth/auth.repository
 *
 * @description Kimlik doğrulama tabloları (users, user_sessions,
 * user_invitations, password_reset_tokens) için DB erişim katmanı.
 * RLS context'i uygulanmaz (login akışı email araması + session
 * doğrulama her durumda çalışmalı). Service katmanı status, kilit
 * ve tenant kontrolü yapar.
 *
 * @security
 * - Bu repository yalnızca auth service tarafından çağrılır.
 * - password_hash, token_hash gibi hassas alanlar bu katmanda
 *   dönmez; service yalnızca doğrulama için kullanır.
 * - RLS YOK (login + davet akışı email araması yapar).
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Injectable } from "@nestjs/common";
import type { Prisma, User, UserSession, UserInvitation, PasswordResetToken } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class AuthRepository {
  public constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // User
  // ---------------------------------------------------------------------------

  /** Email ile kullanıcı bulur. Login akışı için. */
  public async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** ID ile kullanıcı bulur. Session doğrulama için. */
  public async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Yeni kullanıcı oluşturur. Davet kabul akışı + tenant oluşturma. */
  public async createUser(data: {
    email: string;
    passwordHash: string;
    displayName: string;
    locale?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
        ...(data.locale !== undefined ? { locale: data.locale } : {}),
      },
    });
  }

  /** Parola güncelle. passwordChangedAt set edilir. */
  public async updatePassword(
    userId: string,
    passwordHash: string,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }

  /** Başarısız login sayacı artır; eşik aşılırsa kilit. */
  public async recordFailedLogin(
    userId: string,
    newCount: number,
    lockUntil: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: newCount,
        ...(lockUntil !== null ? { lockedUntil: lockUntil } : { lockedUntil: null }),
      },
    });
  }

  /** Başarılı login sonrası sayaç sıfırla + lastLoginAt set et. */
  public async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  }

  /** Hesap durumunu değiştirir. */
  public async updateStatus(
    userId: string,
    status: "active" | "suspended" | "disabled",
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  // ---------------------------------------------------------------------------
  // UserSession
  // ---------------------------------------------------------------------------

  /** Yeni session oluşturur. */
  public async createSession(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgentHash: string | null;
    activeBranchId?: string | null;
  }): Promise<UserSession> {
    return this.prisma.userSession.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgentHash: data.userAgentHash,
        ...(data.activeBranchId !== undefined
          ? { activeBranchId: data.activeBranchId }
          : {}),
      },
    });
  }

  /**
   * Session'ın aktif branch context'ini günceller. Multi-branch
   * tenant senaryosu için kullanıcı branch değiştirdiğinde çağrılır.
   */
  public async setSessionActiveBranch(
    sessionId: string,
    branchId: string | null,
  ): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { activeBranchId: branchId },
    });
  }

  /** Token hash ile session bulur. */
  public async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<UserSession | null> {
    return this.prisma.userSession.findUnique({ where: { tokenHash } });
  }

  /** Session'ın `lastUsedAt` alanını günceller. */
  public async touchSession(id: string, lastUsedAt: Date): Promise<void> {
    await this.prisma.userSession.update({
      where: { id },
      data: { lastUsedAt },
    });
  }

  /** Session'ı iptal eder (logout). */
  public async revokeSession(
    id: string,
    reason: string,
    replacedById?: string,
  ): Promise<void> {
    await this.prisma.userSession.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
        ...(replacedById !== undefined ? { replacedById } : {}),
      },
    });
  }

  /** Kullanıcının aktif session'larını listeler. */
  public async listActiveSessions(
    userId: string,
  ): Promise<UserSession[]> {
    return this.prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  /** Kullanıcının tüm session'larını listeler (iptal edilenler dahil). */
  public async listAllSessions(userId: string): Promise<UserSession[]> {
    return this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Kullanıcının tüm session'larını iptal eder (admin/security action). */
  public async revokeAllSessions(
    userId: string,
    reason: string,
  ): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  // ---------------------------------------------------------------------------
  // UserInvitation
  // ---------------------------------------------------------------------------

  /** Yeni davet oluşturur. */
  public async createInvitation(data: {
    tenantId: string;
    email: string;
    role: string;
    tokenHash: string;
    invitedBy: string | null;
    expiresAt: Date;
  }): Promise<UserInvitation> {
    return this.prisma.userInvitation.create({
      data: {
        tenantId: data.tenantId,
        email: data.email,
        role: data.role,
        tokenHash: data.tokenHash,
        invitedBy: data.invitedBy,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Token hash ile davet bulur. */
  public async findInvitationByTokenHash(
    tokenHash: string,
  ): Promise<UserInvitation | null> {
    return this.prisma.userInvitation.findUnique({ where: { tokenHash } });
  }

  /** Tenant'ın aktif davetlerini listeler. */
  public async listInvitations(
    tenantId: string,
  ): Promise<UserInvitation[]> {
    return this.prisma.userInvitation.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Daveti kabul/iptal/expired olarak işaretle. */
  public async updateInvitation(
    id: string,
    data: Prisma.UserInvitationUpdateInput,
  ): Promise<UserInvitation> {
    return this.prisma.userInvitation.update({ where: { id }, data });
  }

  /** Süresi dolmuş pending davetleri expired yapar. */
  public async expireOldInvitations(): Promise<number> {
    const result = await this.prisma.userInvitation.updateMany({
      where: {
        status: "pending",
        expiresAt: { lt: new Date() },
      },
      data: { status: "expired" },
    });
    return result.count;
  }

  // ---------------------------------------------------------------------------
  // PasswordResetToken
  // ---------------------------------------------------------------------------

  /** Yeni parola sıfırlama token'ı oluşturur. */
  public async createPasswordReset(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Token hash ile parola sıfırlama kaydı bulur. */
  public async findPasswordResetByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
  }

  /** Kullanıcının tüm aktif reset token'larını iptal eder (rotation). */
  public async revokePasswordResets(userId: string): Promise<number> {
    const result = await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count;
  }

  /** Parola sıfırlama token'ını kullanıldı olarak işaretle. */
  public async markPasswordResetUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
