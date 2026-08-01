/**
 * @file Auth repository.
 * @module apps/api/common/auth/auth.repository
 * @description Kimlik doğrulama tabloları (users, user_sessions,
 * user_invitations, password_reset_tokens) için DB erişim katmanı.
 * RLS context'i uygulanmaz (login akışı email araması + session
 * doğrulama her durumda çalışmalı). Service katmanı status, kilit
 * ve tenant kontrolü yapar.
 * @security
 * - Bu repository yalnızca auth service tarafından çağrılır.
 * - password_hash, token_hash gibi hassas alanlar bu katmanda
 *   dönmez; service yalnızca doğrulama için kullanır.
 * - RLS YOK (login + davet akışı email araması yapar).
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  Prisma,
  User,
  UserSession,
  UserTenantMembership,
  UserInvitation,
  PasswordResetToken,
} from "@prisma/client";

/** RLS ile doğrulanmış aktif üyelik ve login için gereken tenant özeti. */
export interface ActiveMembershipWithTenant {
  tenantId: string;
  role: string;
  status: UserTenantMembership["status"];
  tenant: {
    id: string;
    slug: string;
    name: string;
    country: string;
    defaultLocale: string;
    timezone: string;
  };
}

@Injectable()
export class AuthRepository {
  public constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // User
  // ---------------------------------------------------------------------------

  /**
   * Email ile kullanıcı bulur. Login akışı için.
   * @param email
   */
  public async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * ID ile kullanıcı bulur. Session doğrulama için.
   * @param id
   */
  public async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Yeni kullanıcı oluşturur. Davet kabul akışı + tenant oluşturma.
   * @param data
   * @param data.email
   * @param data.passwordHash
   * @param data.displayName
   * @param data.locale
   */
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

  /**
   * Parola güncelle. PasswordChangedAt set edilir.
   * @param userId
   * @param passwordHash
   */
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

  /**
   * Başarısız login sayacı artır; eşik aşılırsa kilit.
   * @param userId
   * @param newCount
   * @param lockUntil
   */
  public async recordFailedLogin(
    userId: string,
    newCount: number,
    lockUntil: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: newCount,
        ...(lockUntil !== null
          ? { lockedUntil: lockUntil }
          : { lockedUntil: null }),
      },
    });
  }

  /**
   * Başarılı login sonrası sayaç sıfırla + lastLoginAt set et.
   * @param userId
   */
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

  /**
   * Hesap durumunu değiştirir.
   * @param userId
   * @param status
   */
  public async updateStatus(
    userId: string,
    status: "active" | "suspended" | "disabled",
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  /**
   * Kullanıcının aktif üyeliğini, kullanıcı-bağlamlı RLS transaction'ında
   * tenant özetiyle birlikte çözer. Login ve AuthGuard bu metodu kullanır.
   * @param userId
   * @param tenantSlug İsteğe bağlı tenant seçimi.
   */
  public async findActiveMembershipWithTenant(
    userId: string,
    tenantSlug?: string,
  ): Promise<ActiveMembershipWithTenant | null> {
    return this.withUserContext(userId, (tx) =>
      tx.userTenantMembership.findFirst({
        where: {
          userId,
          status: "active",
          ...(tenantSlug !== undefined ? { tenant: { slug: tenantSlug } } : {}),
        },
        include: {
          tenant: {
            select: {
              id: true,
              slug: true,
              name: true,
              country: true,
              defaultLocale: true,
              timezone: true,
            },
          },
        },
        orderBy: { assignedAt: "asc" },
      }),
    );
  }

  /** Kullanıcının tüm aktif üyeliklerini RLS kullanıcı bağlamında döner. */
  public async listActiveMembershipsWithTenant(
    userId: string,
  ): Promise<ActiveMembershipWithTenant[]> {
    return this.withUserContext(userId, (tx) =>
      tx.userTenantMembership.findMany({
        where: { userId, status: "active" },
        include: {
          tenant: {
            select: {
              id: true,
              slug: true,
              name: true,
              country: true,
              defaultLocale: true,
              timezone: true,
            },
          },
        },
        orderBy: { assignedAt: "asc" },
      }),
    );
  }

  /** Davet kabulünde üyeliği yalnız davetin tenant bağlamında upsert eder. */
  public async upsertMembershipForTenant(args: {
    userId: string;
    tenantId: string;
    role: string;
  }): Promise<void> {
    await this.withTenantContext(args.tenantId, (tx) =>
      tx.userTenantMembership.upsert({
        where: {
          userId_tenantId: {
            userId: args.userId,
            tenantId: args.tenantId,
          },
        },
        create: {
          userId: args.userId,
          tenantId: args.tenantId,
          role: args.role,
        },
        update: {
          role: args.role,
          status: "active",
          revokedAt: null,
          assignedAt: new Date(),
        },
      }),
    );
  }

  /** Login tenant'ının ilk aktif şubesini tenant-bağlamlı RLS ile bulur. */
  public async findDefaultActiveBranch(
    tenantId: string,
  ): Promise<{ id: string } | null> {
    return this.withTenantContext(tenantId, (tx) =>
      tx.branch.findFirst({
        where: { tenantId, status: "active" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    );
  }

  /**
   * Branch-switch için erişilebilir aktif şubeyi bulur. Normal kullanıcıda her
   * aktif üyeliğin tenant bağlamı ayrı transaction'da denenir; superadmin
   * bağlamı yalnız doğrulanmış `isSuperadmin` çağrısında açılır.
   */
  public async findActiveBranchForUser(
    userId: string,
    branchId: string,
    isSuperadmin: boolean,
  ): Promise<{ id: string; tenantId: string; archivedAt: Date | null } | null> {
    if (isSuperadmin) {
      return this.withSuperadminContext((tx) =>
        tx.branch.findUnique({
          where: { id: branchId },
          select: { id: true, tenantId: true, archivedAt: true },
        }),
      );
    }

    const memberships = await this.listActiveMembershipsWithTenant(userId);
    for (const membership of memberships) {
      const branch = await this.withTenantContext(membership.tenantId, (tx) =>
        tx.branch.findFirst({
          where: { id: branchId, tenantId: membership.tenantId },
          select: { id: true, tenantId: true, archivedAt: true },
        }),
      );
      if (branch) return branch;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // UserSession
  // ---------------------------------------------------------------------------

  /**
   * Yeni session oluşturur.
   * @param data
   * @param data.userId
   * @param data.tokenHash
   * @param data.expiresAt
   * @param data.ipAddress
   * @param data.userAgentHash
   * @param data.activeBranchId
   */
  public async createSession(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgentHash: string | null;
    activeBranchId?: string | null;
  }): Promise<UserSession> {
    return this.withUserContext(data.userId, (tx) =>
      tx.userSession.create({
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
      }),
    );
  }

  /**
   * Session'ın aktif branch context'ini günceller. Multi-branch
   * tenant senaryosu için kullanıcı branch değiştirdiğinde çağrılır.
   * @param sessionId
   * @param branchId
   */
  public async setSessionActiveBranch(
    sessionId: string,
    userId: string,
    branchId: string | null,
  ): Promise<void> {
    await this.withUserContext(userId, (tx) =>
      tx.userSession.update({
        where: { id: sessionId },
        data: { activeBranchId: branchId },
      }),
    );
  }

  /**
   * Token hash ile session bulur.
   * @param tokenHash
   */
  public async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<UserSession | null> {
    return this.withSessionTokenContext(tokenHash, (tx) =>
      tx.userSession.findUnique({ where: { tokenHash } }),
    );
  }

  /** Kullanıcının yalnız kendi oturumunu session yönetimi için getirir. */
  public async findSessionByIdForUser(
    sessionId: string,
    userId: string,
  ): Promise<UserSession | null> {
    return this.withUserContext(userId, (tx) =>
      tx.userSession.findUnique({ where: { id: sessionId } }),
    );
  }

  /**
   * Session'ın `lastUsedAt` alanını günceller.
   * @param id
   * @param lastUsedAt
   */
  public async touchSession(
    id: string,
    userId: string,
    lastUsedAt: Date,
  ): Promise<void> {
    await this.withUserContext(userId, (tx) =>
      tx.userSession.update({ where: { id }, data: { lastUsedAt } }),
    );
  }

  /**
   * Session'ı iptal eder (logout).
   * @param id
   * @param reason
   * @param replacedById
   */
  public async revokeSession(
    id: string,
    userId: string,
    reason: string,
    replacedById?: string,
  ): Promise<void> {
    await this.withUserContext(userId, (tx) =>
      tx.userSession.update({
        where: { id },
        data: {
          revokedAt: new Date(),
          revokedReason: reason,
          ...(replacedById !== undefined ? { replacedById } : {}),
        },
      }),
    );
  }

  /**
   * Kullanıcının aktif session'larını listeler.
   * @param userId
   */
  public async listActiveSessions(userId: string): Promise<UserSession[]> {
    return this.withUserContext(userId, (tx) =>
      tx.userSession.findMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { lastUsedAt: "desc" },
      }),
    );
  }

  /**
   * Kullanıcının tüm session'larını listeler (iptal edilenler dahil).
   * @param userId
   */
  public async listAllSessions(userId: string): Promise<UserSession[]> {
    return this.withUserContext(userId, (tx) =>
      tx.userSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  /**
   * Kullanıcının tüm session'larını iptal eder (admin/security action).
   * @param userId
   * @param reason
   */
  public async revokeAllSessions(
    userId: string,
    reason: string,
  ): Promise<number> {
    const result = await this.withUserContext(userId, (tx) =>
      tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
    );
    return result.count;
  }

  // ---------------------------------------------------------------------------
  // UserInvitation
  // ---------------------------------------------------------------------------

  /**
   * Yeni davet oluşturur.
   * @param data
   * @param data.tenantId
   * @param data.email
   * @param data.role
   * @param data.tokenHash
   * @param data.invitedBy
   * @param data.expiresAt
   */
  public async createInvitation(data: {
    tenantId: string;
    email: string;
    role: string;
    tokenHash: string;
    invitedBy: string | null;
    expiresAt: Date;
  }): Promise<UserInvitation> {
    return this.withTenantContext(data.tenantId, (tx) =>
      tx.userInvitation.create({
        data: {
          tenantId: data.tenantId,
          email: data.email,
          role: data.role,
          tokenHash: data.tokenHash,
          invitedBy: data.invitedBy,
          expiresAt: data.expiresAt,
        },
      }),
    );
  }

  /** Aynı tenant/email için bekleyen daveti tenant RLS bağlamında bulur. */
  public async findPendingInvitation(
    tenantId: string,
    email: string,
  ): Promise<UserInvitation | null> {
    return this.withTenantContext(tenantId, (tx) =>
      tx.userInvitation.findFirst({
        where: { tenantId, email, status: "pending" },
      }),
    );
  }

  /**
   * Token hash ile davet bulur.
   * @param tokenHash
   */
  public async findInvitationByTokenHash(
    tokenHash: string,
  ): Promise<UserInvitation | null> {
    return this.withInvitationTokenContext(tokenHash, (tx) =>
      tx.userInvitation.findUnique({ where: { tokenHash } }),
    );
  }

  /**
   * Tenant'ın aktif davetlerini listeler.
   * @param tenantId
   */
  public async listInvitations(tenantId: string): Promise<UserInvitation[]> {
    return this.withTenantContext(tenantId, (tx) =>
      tx.userInvitation.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  /**
   * Daveti kabul/iptal/expired olarak işaretle.
   * @param id
   * @param data
   */
  public async updateInvitation(
    tenantId: string,
    id: string,
    data: Prisma.UserInvitationUpdateInput,
  ): Promise<UserInvitation> {
    return this.withTenantContext(tenantId, (tx) =>
      tx.userInvitation.update({ where: { id }, data }),
    );
  }

  /** Süresi dolmuş pending davetleri expired yapar. */
  public async expireOldInvitations(tenantId: string): Promise<number> {
    const result = await this.withTenantContext(tenantId, (tx) =>
      tx.userInvitation.updateMany({
        where: {
          tenantId,
          status: "pending",
          expiresAt: { lt: new Date() },
        },
        data: { status: "expired" },
      }),
    );
    return result.count;
  }

  // ---------------------------------------------------------------------------
  // PasswordResetToken
  // ---------------------------------------------------------------------------

  /**
   * Yeni parola sıfırlama token'ı oluşturur.
   * @param data
   * @param data.userId
   * @param data.tokenHash
   * @param data.expiresAt
   */
  public async createPasswordReset(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    return this.withUserContext(data.userId, (tx) =>
      tx.passwordResetToken.create({
        data: {
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      }),
    );
  }

  /**
   * Token hash ile parola sıfırlama kaydı bulur.
   * @param tokenHash
   */
  public async findPasswordResetByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetToken | null> {
    return this.withPasswordResetTokenContext(tokenHash, (tx) =>
      tx.passwordResetToken.findUnique({ where: { tokenHash } }),
    );
  }

  /**
   * Kullanıcının tüm aktif reset token'larını iptal eder (rotation).
   * @param userId
   */
  public async revokePasswordResets(userId: string): Promise<number> {
    const result = await this.withUserContext(userId, (tx) =>
      tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    );
    return result.count;
  }

  /**
   * Parola sıfırlama token'ını kullanıldı olarak işaretle.
   * @param id
   */
  public async markPasswordResetUsed(
    id: string,
    userId: string,
  ): Promise<void> {
    await this.withUserContext(userId, (tx) =>
      tx.passwordResetToken.update({
        where: { id },
        data: { usedAt: new Date() },
      }),
    );
  }

  /** Session write/read işlemlerinde kullanıcı RLS bağlamını kurar. */
  private async withUserContext<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    });
  }

  /** Bearer token doğrulamasında yalnızca hash eşitliğiyle SELECT açar. */
  private async withSessionTokenContext<T>(
    tokenHash: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.session_token_hash', ${tokenHash}, true)`;
      return fn(tx);
    });
  }

  /** Public invitation token doğrulamasında yalnız eşleşen satıra SELECT açar. */
  private async withInvitationTokenContext<T>(
    tokenHash: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`;
      return fn(tx);
    });
  }

  /** Public reset token doğrulamasında yalnız eşleşen satıra SELECT açar. */
  private async withPasswordResetTokenContext<T>(
    tokenHash: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.password_reset_token_hash', ${tokenHash}, true)`;
      return fn(tx);
    });
  }

  /** Tenant bağlı login/şube sorgularında RLS bağlamını aynı transaction'da kurar. */
  private async withTenantContext<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  /** Doğrulanmış superadmin akışlarında cross-tenant RLS bağlamını kurar. */
  private async withSuperadminContext<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      return fn(tx);
    });
  }
}
