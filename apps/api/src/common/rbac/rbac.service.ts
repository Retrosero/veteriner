/**
 * @file RBAC servisi.
 * @module apps/api/common/rbac/rbac.service
 *
 * @description VetNiva RBAC motoru. Üç ana sorumluluk:
 *
 * 1. **Permission değerlendirme** — `evaluate()` ile katalogdaki
 *    permission'ları actor bağlamında karara bağlar.
 * 2. **Tenant üyelik yönetimi** — `assignMembership`,
 *    `revokeMembership`, `listMemberships` ile OWNER/SUPERADMIN
 *    tenant üyelerini yönetir.
 * 3. **Branch context yönetimi** — `switchBranch()` ile aktif
 *    session'ın branch'ini değiştirir.
 *
 * Tüm mutasyonlar `AuditService` üzerinden `audit:rbac.*` event'leri
 * üretir. Reddedilen permission denemeleri `audit:rbac.permission_denied`
 * (warning), başarılı `audit` işaretli permission'lar ise
 * `audit:rbac.permission_granted` (info) olarak yazılır.
 *
 * @security
 * - SUPERADMIN tüm permission'ları bypass eder; ayrıca
 *   cross-tenant erişim sağlar.
 * - Kendi kendine rol atama engellenir (self-assign).
 * - Branch değişikliği yalnızca hedef branch aynı tenant'a
 *   aitse yapılır.
 * - Tenant üyeliği iptali fiziksel silme DEĞİLDİR; status=revoked
 *   soft delete (audit trail korunur).
 *
 * @since GOAL-002 (FAZ-0) yetki matrisi
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { ActorContext, ActorRole } from "../actor/actor-context.service.js";
import { AuditService } from "../audit/audit.service.js";
import { DomainError } from "../errors/domain-error.js";
import type {
  AssignMembershipRequest,
  AssignMembershipResponse,
  MembershipItem,
  MembershipListResponse,
  MembershipStatus,
  MyMembershipsResponse,
  MyPermissionsResponse,
  SwitchBranchResponse,
} from "@vetniva/contracts";

import { loadPermissionCatalog } from "./permission-catalog.loader.js";
import type {
  PermissionDecision,
  PermissionDefinition,
  PermissionEvaluationContext,
} from "./permission.types.js";
import { RbacRepository, type MembershipWithUser } from "./rbac.repository.js";

/** Hata kodu sabitleri. */
export const AUTHZ_FORBIDDEN = "VET-AUTHZ-0001";
export const AUTHZ_BRANCH_SCOPE_MISS = "VET-AUTHZ-0002";
export const RBAC_TENANT_INACTIVE = "VET-RBAC-0001";
export const RBAC_USER_INACTIVE = "VET-RBAC-0002";
export const RBAC_SELF_ASSIGN = "VET-RBAC-0003";
export const RBAC_LAST_OWNER = "VET-RBAC-0004";
export const RBAC_BRANCH_MISMATCH = "VET-RBAC-0005";

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  private index: Map<string, PermissionDefinition> | null = null;

  public constructor(
    private readonly audit: AuditService,
    private readonly repo: RbacRepository,
  ) {}

  // ===========================================================================
  // PERMISSION EVALUATION
  // ===========================================================================

  public evaluate(ctx: PermissionEvaluationContext): PermissionDecision {
    const def = this.lookup(ctx.permission);

    if (!def) {
      const decision: PermissionDecision = {
        permission: ctx.permission,
        allowed: false,
        reason: "no_role_match",
        context: { reason: "permission_not_in_catalog" },
      };
      void this.auditDenied(ctx, decision);
      return decision;
    }

    if (ctx.actor.actorType === "system") {
      const decision: PermissionDecision = {
        permission: ctx.permission,
        allowed: def.systemOnly,
        reason: "system_actor",
      };
      if (!decision.allowed) void this.auditDenied(ctx, decision);
      return decision;
    }

    if (ctx.actor.isSuperadmin) {
      const decision: PermissionDecision = {
        permission: ctx.permission,
        allowed: true,
        reason: "superadmin_bypass",
      };
      if (def.audit) void this.auditGranted(ctx, decision);
      return decision;
    }

    const role = ctx.actor.role;
    if (!def.appliesToRoles.includes(role)) {
      const decision: PermissionDecision = {
        permission: ctx.permission,
        allowed: false,
        reason: "no_role_match",
        context: { actorRole: role, allowedRoles: def.appliesToRoles },
      };
      void this.auditDenied(ctx, decision);
      return decision;
    }

    if (def.tenantScope === "required" && !ctx.actor.tenantId) {
      const decision: PermissionDecision = {
        permission: ctx.permission,
        allowed: false,
        reason: "tenant_scope_required",
      };
      void this.auditDenied(ctx, decision);
      return decision;
    }

    if (def.branchScope === "required" && !ctx.actor.branchId) {
      const decision: PermissionDecision = {
        permission: ctx.permission,
        allowed: false,
        reason: "branch_scope_required",
      };
      void this.auditDenied(ctx, decision);
      return decision;
    }

    if (def.selfOnly) {
      const owner = ctx.resourceOwnerId;
      if (!owner || owner !== ctx.actor.actorId) {
        const decision: PermissionDecision = {
          permission: ctx.permission,
          allowed: false,
          reason: "self_only_mismatch",
        };
        void this.auditDenied(ctx, decision);
        return decision;
      }
    }

    const decision: PermissionDecision = {
      permission: ctx.permission,
      allowed: true,
      reason: "role_match",
    };
    if (def.audit) void this.auditGranted(ctx, decision);
    return decision;
  }

  public evaluateAll(
    ctxBase: Omit<PermissionEvaluationContext, "permission">,
    permissions: ReadonlyArray<string>,
  ): PermissionDecision {
    for (const p of permissions) {
      const decision = this.evaluate({ ...ctxBase, permission: p });
      if (!decision.allowed) return decision;
    }
    return {
      permission: permissions.join("+"),
      allowed: true,
      reason: "role_match",
    };
  }

  public listPermissionsForRole(
    role: Parameters<RbacService["evaluate"]>[0]["actor"]["role"],
  ): ReadonlyArray<string> {
    const defs = this.all();
    return defs.filter((d) => d.appliesToRoles.includes(role)).map((d) => d.key);
  }

  public describe(permission: string): PermissionDefinition | undefined {
    return this.lookup(permission);
  }

  public all(): ReadonlyArray<PermissionDefinition> {
    this.ensureIndex();
    return Array.from((this.index as Map<string, PermissionDefinition>).values());
  }

  // ===========================================================================
  // MY PERMISSIONS / MY MEMBERSHIPS
  // ===========================================================================

  /**
   * Aktif actor'ün permission listesini döner. SUPERADMIN ise
   * `isSuperadmin=true` ve tüm permission'lar geçerli (bypass).
   */
  public async getMyPermissions(actor: ActorContext): Promise<MyPermissionsResponse> {
    if (actor.isSuperadmin) {
      const all = this.all();
      return {
        items: all.map((d) => d.key),
        role: actor.role,
        isSuperadmin: true,
        total: all.length,
      };
    }
    const items = this.listPermissionsForRole(actor.role);
    return {
      items: [...items],
      role: actor.role,
      isSuperadmin: false,
      total: items.length,
    };
  }

  /**
   * Aktif kullanıcının tüm aktif üyeliklerini listeler.
   */
  public async getMyMemberships(
    actor: ActorContext,
  ): Promise<MyMembershipsResponse> {
    if (!actor.actorId) {
      return { items: [], activeTenantId: actor.tenantId };
    }
    const rows = await this.repo.listMembershipsForUser(actor.actorId);
    return {
      items: rows.map((m) => ({
        tenantId: m.tenant.id,
        tenantSlug: m.tenant.slug,
        tenantName: m.tenant.name,
        role: m.role as "OWNER" | "VETERINARIAN" | "STAFF" | null,
        status: m.status as MembershipStatus,
        assignedAt: m.assignedAt.toISOString(),
      })),
      activeTenantId: actor.tenantId,
    };
  }

  // ===========================================================================
  // TENANT MEMBERSHIP MANAGEMENT
  // ===========================================================================

  /**
   * Bir tenant'ın aktif üyelerini listeler. Çağıran actor ya
   * SUPERADMIN ya da ilgili tenant'ın OWNER'ı olmalı.
   */
  public async listMemberships(
    tenantId: string,
    actor: ActorContext,
  ): Promise<MembershipListResponse> {
    if (!actor.isSuperadmin) {
      if (actor.role !== "OWNER" || actor.tenantId !== tenantId) {
        throw RbacService.forbiddenError(
          "Tenant üyelerini yalnızca kendi OWNER'ınız veya SUPERADMIN listeleyebilir",
        );
      }
    }

    const rows = await this.repo.listMemberships(tenantId, {
      tenantId: actor.tenantId,
      isSuperadmin: actor.isSuperadmin,
    });

    return {
      items: rows.map((m) => RbacService.toMembershipItem(m)),
      total: rows.length,
    };
  }

  /**
   * Bir kullanıcıya tenant içi rol atar (membership upsert).
   * Kurallar:
   * - Tenant aktif olmalı.
   * - Hedef kullanıcı aktif olmalı.
   * - Kendi kendine rol atanamaz.
   */
  public async assignMembership(
    tenantId: string,
    input: AssignMembershipRequest,
    actor: ActorContext,
  ): Promise<AssignMembershipResponse> {
    if (!actor.isSuperadmin) {
      if (actor.role !== "OWNER" || actor.tenantId !== tenantId) {
        throw RbacService.forbiddenError(
          "Rol atamak için kendi tenant OWNER'ınız veya SUPERADMIN olmalısınız",
        );
      }
    }

    const tenant = await this.repo.tenantExists(tenantId);
    if (!tenant.exists) {
      throw RbacService.notFoundError("Tenant bulunamadı veya kapalı");
    }

    const user = await this.repo.userExists(input.userId);
    if (!user.exists) {
      throw RbacService.notFoundError("Kullanıcı bulunamadı veya arşivlenmiş");
    }

    if (actor.actorId && actor.actorId === input.userId) {
      throw new DomainError({
        errorCode: RBAC_SELF_ASSIGN,
        message: "Kendi rolünüzü değiştiremezsiniz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-RBAC-0003",
        details: { userId: input.userId },
      });
    }

    const before = await this.repo.findMembership(tenantId, input.userId);
    const membership = await this.repo.upsertMembership({
      userId: input.userId,
      tenantId,
      role: input.role,
    });

    await this.audit.recordSimple(
      "audit:rbac.membership.assigned",
      "user_tenant_membership",
      membership.id,
      "create",
      {
        actorId: actor.actorId,
        actorType: "user",
        tenantId,
        branchId: actor.branchId,
        correlationId: actor.correlationId,
        country: "TR",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
      },
      "info",
      {
        targetUserId: input.userId,
        role: input.role,
        beforeRole: before?.role ?? null,
        beforeStatus: before?.status ?? null,
      },
    );

    return {
      membershipId: membership.id,
      userId: membership.userId,
      role: membership.role as "OWNER" | "VETERINARIAN" | "STAFF",
      status: membership.status as MembershipStatus,
      assignedAt: membership.assignedAt.toISOString(),
    };
  }

  /**
   * Bir kullanıcının tenant üyeliğini iptal eder (soft). Son OWNER
   * iptal edilemez; bu durumda hata fırlatılır.
   */
  public async revokeMembership(
    tenantId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<{ revoked: true; membershipId: string }> {
    if (!actor.isSuperadmin) {
      if (actor.role !== "OWNER" || actor.tenantId !== tenantId) {
        throw RbacService.forbiddenError(
          "Üyelik iptali için kendi tenant OWNER'ınız veya SUPERADMIN olmalısınız",
        );
      }
    }

    if (actor.actorId && actor.actorId === userId) {
      throw new DomainError({
        errorCode: RBAC_SELF_ASSIGN,
        message: "Kendi üyeliğinizi iptal edemezsiniz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-RBAC-0003",
        details: { userId },
      });
    }

    const existing = await this.repo.findMembership(tenantId, userId);
    if (!existing) {
      throw RbacService.notFoundError("Üyelik bulunamadı");
    }

    if (existing.role === "OWNER" && existing.status === "active") {
      const all = await this.repo.listMemberships(tenantId, {
        tenantId: actor.tenantId,
        isSuperadmin: actor.isSuperadmin,
      });
      const activeOwners = all.filter(
        (m) => m.role === "OWNER" && m.status === "active",
      );
      if (activeOwners.length <= 1) {
        throw new DomainError({
          errorCode: RBAC_LAST_OWNER,
          message: "Son aktif OWNER iptal edilemez",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-RBAC-0004",
          details: { tenantId, userId },
        });
      }
    }

    const revoked = await this.repo.revokeMembership(tenantId, userId);

    await this.audit.recordSimple(
      "audit:rbac.membership.revoked",
      "user_tenant_membership",
      revoked.id,
      "archive",
      {
        actorId: actor.actorId,
        actorType: "user",
        tenantId,
        branchId: actor.branchId,
        correlationId: actor.correlationId,
        country: "TR",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
      },
      "info",
      {
        targetUserId: userId,
        previousRole: existing.role,
        previousStatus: existing.status,
      },
    );

    return { revoked: true, membershipId: revoked.id };
  }

  // ===========================================================================
  // BRANCH CONTEXT SWITCH
  // ===========================================================================

  /**
   * Aktif session'ın `activeBranchId` alanını günceller. branchId
   * null ise branch context temizlenir.
   */
  public async switchBranch(
    sessionId: string,
    branchId: string | null,
    actor: ActorContext,
  ): Promise<SwitchBranchResponse> {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) {
      throw RbacService.notFoundError("Session bulunamadı");
    }
    if (session.revokedAt !== null || session.expiresAt < new Date()) {
      throw RbacService.forbiddenError("Session geçerli değil");
    }
    if (actor.actorId && session.userId !== actor.actorId) {
      throw RbacService.forbiddenError(
        "Yalnızca kendi session'ınızı değiştirebilirsiniz",
      );
    }

    if (branchId !== null && actor.tenantId) {
      const ok = await this.repo.branchBelongsToTenant(branchId, actor.tenantId);
      if (!ok && !actor.isSuperadmin) {
        throw new DomainError({
          errorCode: RBAC_BRANCH_MISMATCH,
          message: "Branch hedef tenant'a ait değil",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-RBAC-0005",
          details: { branchId, tenantId: actor.tenantId },
        });
      }
    }

    const updated = await this.repo.updateSessionBranch(sessionId, branchId);
    const auditEventId = randomUUID();
    await this.audit.recordSimple(
      "audit:rbac.session.branch_switched",
      "user_session",
      sessionId,
      "update",
      {
        actorId: actor.actorId,
        actorType: "user",
        tenantId: actor.tenantId,
        branchId,
        correlationId: actor.correlationId,
        country: "TR",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
      },
      "info",
      {
        previousBranchId: session.activeBranchId,
        newBranchId: branchId,
      },
    );

    return {
      branchId: updated.activeBranchId,
      sessionId: updated.id,
      auditEventId,
    };
  }

  // ===========================================================================
  // ERROR HELPERS
  // ===========================================================================

  public static forbiddenError(message: string): DomainError {
    return new DomainError({
      errorCode: AUTHZ_FORBIDDEN,
      message,
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  public static notFoundError(message: string): DomainError {
    return new DomainError({
      errorCode: AUTHZ_BRANCH_SCOPE_MISS,
      message: message ?? "İstenen kaynak bulunamadı",
      httpStatus: 404,
      severity: "info",
      i18nKey: "error.VET-AUTHZ-0002",
    });
  }

  public static branchScopeError(): never {
    throw new NotFoundException({
      errorCode: AUTHZ_BRANCH_SCOPE_MISS,
      message: "İstenen kaynak bulunamadı",
      i18nKey: "error.VET-AUTHZ-0002",
    });
  }

  // ===========================================================================
  // PRIVATE
  // ===========================================================================

  private static toMembershipItem(m: MembershipWithUser): MembershipItem {
    return {
      membershipId: m.id,
      userId: m.userId,
      role: m.role as "OWNER" | "VETERINARIAN" | "STAFF",
      status: m.status as MembershipStatus,
      assignedAt: m.assignedAt.toISOString(),
      revokedAt: m.revokedAt ? m.revokedAt.toISOString() : null,
      displayName: m.user.displayName,
      email: m.user.email,
    };
  }

  private lookup(permission: string): PermissionDefinition | undefined {
    this.ensureIndex();
    return (this.index as Map<string, PermissionDefinition>).get(permission);
  }

  private ensureIndex(): void {
    if (this.index) return;
    const defs = loadPermissionCatalog();
    this.index = new Map(defs.map((d) => [d.key, d]));
    this.logger.log(
      `RBAC kataloğu yüklendi: ${defs.length} permission tanımı.`,
    );
  }

  private async auditGranted(
    ctx: PermissionEvaluationContext,
    decision: PermissionDecision,
  ): Promise<void> {
    try {
      await this.audit.recordSimple(
        "audit:rbac.permission_granted",
        "permission",
        ctx.permission,
        "read",
        {
          actorId: ctx.actor.actorId,
          actorType: "user",
          tenantId: ctx.actor.tenantId,
          branchId: ctx.actor.branchId,
          correlationId:
            (ctx.actor as { correlationId?: string }).correlationId ??
            `rbac-${Date.now()}`,
          country: "TR",
        },
        "info",
        {
          permission: decision.permission,
          reason: decision.reason,
        },
      );
    } catch (err) {
      this.logger.warn(
        `audit:rbac.permission_granted yazılamadı: ${(err as Error).message}`,
      );
    }
  }

  private async auditDenied(
    ctx: PermissionEvaluationContext,
    decision: PermissionDecision,
  ): Promise<void> {
    try {
      await this.audit.recordSimple(
        "audit:rbac.permission_denied",
        "permission",
        ctx.permission,
        "read",
        {
          actorId: ctx.actor.actorId,
          actorType: "user",
          tenantId: ctx.actor.tenantId,
          branchId: ctx.actor.branchId,
          correlationId:
            (ctx.actor as { correlationId?: string }).correlationId ??
            `rbac-${Date.now()}`,
          country: "TR",
        },
        "warning",
        {
          permission: decision.permission,
          reason: decision.reason,
          actorRole: ctx.actor.role,
          actorIsSuperadmin: ctx.actor.isSuperadmin,
        },
      );
    } catch (err) {
      this.logger.warn(
        `audit:rbac.permission_denied yazılamadı: ${(err as Error).message}`,
      );
    }
  }
}
