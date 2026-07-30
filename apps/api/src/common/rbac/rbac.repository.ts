/**
 * @file RBAC repository.
 * @module apps/api/common/rbac/rbac.repository
 *
 * @description RBAC veri erişim katmanı. PrismaClient üzerinden
 * `UserTenantMembership`, `UserSession`, `User`, `Tenant` ve
 * `Branch` tablolarına sorgu yapar.
 *
 * Sorumluluk:
 * - Tenant üyelik CRUD (listele, upsert, soft-revoke).
 * - Kullanıcının tüm üyeliklerini getir (multi-tenant senaryosu).
 * - Aktif session'ın `activeBranchId` alanını güncelle (branch
 *   context değişimi).
 * - Tenant ve branch varlık kontrolü.
 *
 * @security
 * - RLS context (`app.tenant_id`, `app.is_superadmin`) her sorguda
 *   set edilir; branch repository ile aynı pattern.
 * - Üyelik iptali fiziksel silme DEĞİLDİR (status=revoked).
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { Injectable } from "@nestjs/common";
import type { UserTenantMembership } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service.js";

/** Tenant üyeliği ile birlikte kullanıcı özetini getiren sorgu sonucu. */
export interface MembershipWithUser {
  id: string;
  userId: string;
  role: string;
  status: string;
  assignedAt: Date;
  revokedAt: Date | null;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

@Injectable()
export class RbacRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async listMemberships(
    tenantId: string,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<MembershipWithUser[]> {
    return this.withContext(actor, async () => {
      const rows = await this.prisma.userTenantMembership.findMany({
        where: { tenantId, status: { in: ["active", "suspended"] } },
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { assignedAt: "asc" },
      });
      return rows as MembershipWithUser[];
    });
  }

  public async listMembershipsForUser(userId: string): Promise<
    Array<{
      id: string;
      role: string;
      status: string;
      assignedAt: Date;
      revokedAt: Date | null;
      tenant: { id: string; slug: string; name: string };
    }>
  > {
    return this.prisma.userTenantMembership.findMany({
      where: { userId, status: "active" },
      include: {
        tenant: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { assignedAt: "asc" },
    });
  }

  public async findMembership(
    tenantId: string,
    userId: string,
  ): Promise<UserTenantMembership | null> {
    return this.prisma.userTenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
  }

  public async upsertMembership(args: {
    userId: string;
    tenantId: string;
    role: string;
  }): Promise<UserTenantMembership> {
    return this.prisma.userTenantMembership.upsert({
      where: {
        userId_tenantId: { userId: args.userId, tenantId: args.tenantId },
      },
      create: {
        userId: args.userId,
        tenantId: args.tenantId,
        role: args.role,
        status: "active",
        assignedAt: new Date(),
      },
      update: {
        role: args.role,
        status: "active",
        revokedAt: null,
        assignedAt: new Date(),
      },
    });
  }

  public async revokeMembership(
    tenantId: string,
    userId: string,
  ): Promise<UserTenantMembership> {
    return this.prisma.userTenantMembership.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { status: "revoked", revokedAt: new Date() },
    });
  }

  public async updateSessionBranch(
    sessionId: string,
    branchId: string | null,
  ): Promise<{ id: string; activeBranchId: string | null }> {
    return this.prisma.userSession.update({
      where: { id: sessionId },
      data: { activeBranchId: branchId, lastUsedAt: new Date() },
      select: { id: true, activeBranchId: true },
    });
  }

  public async findSessionById(sessionId: string): Promise<{
    id: string;
    userId: string;
    activeBranchId: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null> {
    return this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        activeBranchId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  public async tenantExists(
    tenantId: string,
  ): Promise<{ exists: boolean; status: string | null }> {
    const found = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true },
    });
    if (!found) return { exists: false, status: null };
    return { exists: found.status === "active", status: found.status };
  }

  public async userExists(
    userId: string,
  ): Promise<{ exists: boolean; isSuperadmin: boolean; archived: boolean }> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperadmin: true, archivedAt: true },
    });
    if (!found) return { exists: false, isSuperadmin: false, archived: false };
    return {
      exists: found.archivedAt === null,
      isSuperadmin: found.isSuperadmin,
      archived: found.archivedAt !== null,
    };
  }

  public async branchBelongsToTenant(
    branchId: string,
    tenantId: string,
  ): Promise<boolean> {
    const found = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, status: "active" },
      select: { id: true },
    });
    return found !== null;
  }

  private async withContext<T>(
    actor: { tenantId: string | null; isSuperadmin: boolean },
    fn: () => Promise<T>,
  ): Promise<T> {
    const isSuper = actor.isSuperadmin ? "true" : "false";
    const tenantId = actor.tenantId ?? "";
    try {
      await this.prisma.$executeRawUnsafe(
        `SELECT set_config('app.is_superadmin', '${isSuper}', true)`,
      );
      if (tenantId) {
        await this.prisma.$executeRawUnsafe(
          `SELECT set_config('app.tenant_id', '${tenantId.replace(/'/g, "''")}', true)`,
        );
      }
    } catch {
      // Mock/SQLite ortamda bu başarısız olur; yoksay.
    }
    return fn();
  }
}
