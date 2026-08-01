/**
 * @file Permissions guard.
 * @module apps/api/common/guards/permissions.guard
 * @description `AuthGuard` sonrasında çalışır. `@RequirePermissions()`
 * metadata'sında tanımlı permission'ları `RbacService` ile değerlendirir.
 * @security
 * - Branch scope mismatch: 404 döner (kaynak yok gibi); bilgi sızdırmaz.
 * - SUPERADMIN tüm permission'lara sahiptir (bypass).
 * @since GOAL-002 (FAZ-0) yetki matrisi
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RbacService } from "../../modules/rbac/rbac.service.js";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator.js";

import type { ActorContext } from "../actor/actor-context.service.js";
import type { Permission } from "../permissions/permission-spec.js";
import type { Request } from "express";

@Injectable()
export class PermissionsGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      ReadonlyArray<Permission>
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { actor?: ActorContext }>();
    const actor = request.actor;
    if (!actor) return true;

    for (const permission of required) {
      const decision = this.rbac.hasPermission(actor, permission);
      if (!decision.allowed) {
        throw RbacService.authzError(
          decision.reason === "self_only_mismatch" ? "self_only" : "forbidden",
          "Bu işlem için yetkiniz yok",
        );
      }
    }
    return true;
  }
}
