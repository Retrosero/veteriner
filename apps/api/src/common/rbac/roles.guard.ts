/**
 * @file Roles guard.
 * @module apps/api/common/rbac/roles.guard
 *
 * @description `@RequireRole()` metadata'sında tanımlı rollerin
 * herhangi birini (OR semantiği) kabul eder. SUPERADMIN her zaman
 * bypass yapar.
 *
 * Davranış:
 * - Route'da `@RequireRole()` yoksa → izin ver.
 * - AuthGuard aktör üretmemişse → izin ver.
 * - SUPERADMIN ise → izin ver.
 * - Aktör rolü metadata listesinde yoksa → 403 VET-AUTHZ-0001.
 *
 * Bu guard permission-bazlı `PermissionsGuard`'dan daha gevşektir.
 * Hassas işlemler için `@RequirePermission()` tercih edilir; bu
 * guard "hangi tipler bu endpoint'i çağırabilir" için hızlı bir
 * kontrol noktasıdır.
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
import { RbacService } from "./rbac.service.js";
import { ROLE_KEY } from "./require-role.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ReadonlyArray<ActorRole>>(
      ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { actor?: ActorContext }>();
    const actor = request.actor;
    if (!actor) return true;

    if (actor.isSuperadmin) return true;
    if (required.includes(actor.role)) return true;

    throw RbacService.forbiddenError("Bu işlem için yetkiniz yok");
  }
}
