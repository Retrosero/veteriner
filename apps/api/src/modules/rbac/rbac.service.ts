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

import { AuthService } from "../../common/auth/auth.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  PERMISSIONS,
  type Permission,
} from "../../common/permissions/permission-spec.js";
import { loadPermissionCatalog } from "../../common/rbac/permission-catalog.loader.js";

import type {
  ActorContext,
  ActorRole,
} from "../../common/actor/actor-context.service.js";

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
      return RbacService.branchScopeError();
    }

    if (ctx.resourceOwnerId && ctx.resourceOwnerId !== actor.actorId) {
      return { allowed: false, reason: "self_only_mismatch" };
    }

    return { allowed: true, reason: "role_match" };
  }

  public hasRole(
    actor: ActorContext,
    roles: ReadonlyArray<ActorRole>,
  ): boolean {
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
    const declaredPermissions = new Set<string>(PERMISSIONS);
    const definitions = loadPermissionCatalog();
    const undocumentedRuntimeKeys: string[] = [];

    for (const definition of definitions) {
      if (!declaredPermissions.has(definition.key)) {
        undocumentedRuntimeKeys.push(definition.key);
        continue;
      }
      const key = definition.key as Permission;
      this.catalog.set(key, {
        key,
        appliesToRoles: definition.appliesToRoles,
        requiresBranchScope: definition.branchScope === "required",
        requiresTenantScope: definition.tenantScope === "required",
      });
    }

    if (undocumentedRuntimeKeys.length > 0) {
      this.logger.warn(
        `RBAC katalog anahtarları TypeScript sözleşmesinde tanımlı değil, runtime'a alınmadı: ${undocumentedRuntimeKeys.join(", ")}`,
      );
    }

    if (this.catalog.size !== PERMISSIONS.length) {
      throw new Error(
        `RBAC katalog/sözleşme sayısı uyuşmuyor: katalog=${this.catalog.size}, sözleşme=${PERMISSIONS.length}`,
      );
    }

    this.logger.log(
      `RBAC kataloğu yüklendi: ${this.catalog.size} permission tanımı.`,
    );
  }
}
