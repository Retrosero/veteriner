/**
 * @file Roles guard.
 * @module apps/api/common/guards/roles.guard
 *
 * @description `AuthGuard` sonrasında çalışır. `@RequireRoles()`
 * metadata'sında tanımlı rollerin herhangi birini (OR semantiği)
 * kabul eder. SUPERADMIN her zaman bypass yapar.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import type { ActorContext, ActorRole } from "../actor/actor-context.service.js";
import { RbacService } from "../../modules/rbac/rbac.service.js";
import { ROLES_KEY } from "../decorators/require-roles.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ReadonlyArray<ActorRole>>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { actor?: ActorContext }>();
    const actor = request.actor;
    if (!actor) return true;

    if (this.rbac.hasRole(actor, required)) return true;

    throw RbacService.authzError("forbidden", "Bu işlem için yetkiniz yok");
  }
}
