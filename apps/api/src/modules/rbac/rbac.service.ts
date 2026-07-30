/**
 * @file RBAC servisi — minimal core.
 * @module apps/api/modules/rbac/rbac.service
 *
 * @description VetNiva RBAC motorunun GOAL-012 kapsamındaki minimum
 * viable implementasyonu. `PermissionsGuard` ve `RolesGuard` bu
 * servisi kullanır.
 *
 * @security
 * - Bilinmeyen permission → reddedilir (sessiz izin YOK).
 * - Branch scope mismatch → 404 VET-AUTHZ-0002 (bilgi sızdırmaz).
 * - Default 403 → VET-AUTHZ-0001.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import type {
  ActorContext,
  ActorRole,
} from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { AuthService } from "../../common/auth/auth.service.js";
import {
  ACTOR_ROLES,
  PERMISSIONS,
  type Permission,
} from "../../common/permissions/permission-spec.js";

export const AUTHZ_BRANCH_SCOPE_MISS = "VET-AUTHZ-0002";
export const AUTHZ_FORBIDDEN = "VET-AUTHZ-0001";

export interface PermissionSpec {
  readonly key: Permission;
  readonly appliesToRoles: ReadonlyArray<ActorRole>;
  readonly requiresBranchScope: boolean;
  readonly requiresTenantScope: boolean;
}

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  private readonly catalog: Map<Permission, PermissionSpec> = new Map();
  private readonly userPermissionCache: Map<string, ReadonlyArray<Permission>> =
    new Map();

  public constructor(private readonly auth: AuthService) {
    this.initCatalog();
  }

  public hasPermission(
    actor: ActorContext,
    permission: Permission,
    ctx: { resourceOwnerId?: string } = {},
  ): { allowed: boolean; reason: string } {
    if (actor.isSuperadmin || actor.role === "SUPERADMIN") {
      return { allowed: true, reason: "superadmin_bypass" };
    }

    if (actor.actorType === "system") {
      return { allowed: false, reason: "system_actor" };
    }

    const spec = this.catalog.get(permission);
    if (!spec) {
      this.logger.warn(`Bilinmeyen permission: ${permission}`);
      return { allowed: false, reason: "permission_not_in_catalog" };
    }

    if (!spec.appliesToRoles.includes(actor.role)) {
      return { allowed: false, reason: "no_role_match" };
    }

    if (spec.requiresTenantScope && !actor.tenantId) {
      return { allowed: false, reason: "tenant_scope_required" };
    }

    if (spec.requiresBranchScope && !actor.branchId) {
      throw RbacService.branchScopeError();
    }

    if (ctx.resourceOwnerId && ctx.resourceOwnerId !== actor.actorId) {
      return { allowed: false, reason: "self_only_mismatch" };
    }

    return { allowed: true, reason: "role_match" };
  }

  public hasRole(actor: ActorContext, roles: ReadonlyArray<ActorRole>): boolean {
    if (actor.isSuperadmin || actor.role === "SUPERADMIN") return true;
    if (roles.length === 0) return true;
    return roles.includes(actor.role);
  }

  public async getUserPermissions(
    userId: string,
    role: ActorRole,
  ): Promise<ReadonlyArray<Permission>> {
    const cached = this.userPermissionCache.get(`${userId}:${role}`);
    if (cached) return cached;

    const defaults: Permission[] = [];
    for (const [key, spec] of this.catalog.entries()) {
      if (spec.appliesToRoles.includes(role)) defaults.push(key);
    }

    void this.auth;

    this.userPermissionCache.set(`${userId}:${role}`, defaults);
    return defaults;
  }

  public clearUserPermissionCache(): void {
    this.userPermissionCache.clear();
  }

  public listAllPermissions(): ReadonlyArray<Permission> {
    return Array.from(this.catalog.keys());
  }

  public static authzError(
    code: "forbidden" | "self_only",
    message: string,
  ): DomainError {
    return new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message,
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
      details: { code },
    });
  }

  public static branchScopeError(): never {
    throw new NotFoundException({
      errorCode: "VET-AUTHZ-0002",
      message: "İstenen kaynak bulunamadı",
      i18nKey: "error.VET-AUTHZ-0002",
    });
  }

  private initCatalog(): void {
    const branchScopeSet = new Set<Permission>([
      "clinic:appointment:read",
      "clinic:appointment:create",
      "clinic:appointment:update",
      "clinic:appointment:cancel",
      "clinic:appointment:complete",
      "clinic:appointment:export",
      "clinic:appointment:request",
      "clinic:examination:read",
      "clinic:examination:create",
      "clinic:examination:sign",
      "clinic:examination:amend",
      "clinic:examination:export",
      "clinic:soap:read",
      "clinic:soap:create",
      "clinic:soap:update",
      "clinic:soap:amend",
      "clinic:vaccination:read",
      "clinic:vaccination:create",
      "clinic:vaccination:amend",
      "clinic:vaccination:export",
      "clinic:prescription:read",
      "clinic:prescription:create",
      "clinic:prescription:dispense",
      "clinic:prescription:cancel",
      "clinic:prescription:amend",
      "clinic:prescription:export",
      "clinic:surgery:read",
      "clinic:surgery:create",
      "clinic:surgery:schedule",
      "clinic:surgery:start",
      "clinic:surgery:complete",
      "clinic:surgery:cancel",
      "clinic:surgery:amend",
      "clinic:surgery:export",
      "clinic:consent:sign",
      "clinic:consent:read",
      "clinic:anesthesia:read",
      "clinic:anesthesia:create",
      "clinic:anesthesia:update",
      "clinic:anesthesia:export",
      "clinic:hospitalization:read",
      "clinic:hospitalization:admit",
      "clinic:hospitalization:add_note",
      "clinic:hospitalization:discharge",
      "clinic:hospitalization:export",
      "clinic:lab:read",
      "clinic:lab:order",
      "clinic:lab:collect_sample",
      "clinic:lab:enter_result",
      "clinic:lab:amend",
      "clinic:lab:export",
      "clinic:imaging:read",
      "clinic:imaging:order",
      "clinic:imaging:perform",
      "clinic:imaging:report",
      "clinic:imaging:amend",
      "clinic:imaging:export",
      "clinic:stock:read",
      "clinic:stock:receive",
      "clinic:stock:decrement",
      "clinic:stock:adjust",
      "clinic:stock:export",
    ]);

    const allRoles: ReadonlyArray<ActorRole> = ACTOR_ROLES;

    for (const key of PERMISSIONS) {
      const spec: PermissionSpec = {
        key,
        appliesToRoles: allRoles,
        requiresBranchScope: branchScopeSet.has(key),
        requiresTenantScope:
          key !== "tenant:tenant:read" &&
          key !== "tenant:tenant:create" &&
          key !== "tenant:tenant:update" &&
          key !== "tenant:tenant:archive",
      };
      this.catalog.set(key, spec);
    }

    this.logger.log(
      `RBAC kataloğu başlatıldı: ${this.catalog.size} permission, ${branchScopeSet.size} branch-scoped.`,
    );
  }
}
