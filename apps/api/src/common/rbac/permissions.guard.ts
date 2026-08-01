/**
 * @file Permissions guard.
 * @module apps/api/common/rbac/permissions.guard
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RbacService } from "./rbac.service.js";
import { PERMISSIONS_KEY } from "./require-permission.decorator.js";
import { DomainError } from "../errors/domain-error.js";

import type { ActorContext } from "../actor/actor-context.service.js";
import type { Request } from "express";

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  public constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { actor?: ActorContext }>();
    const actor = request.actor;

    if (!actor) {
      throw new UnauthorizedException({
        errorCode: "VET-AUTH-0001",
        message: "Aktör bağlamı bulunamadı",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    for (const permission of required) {
      const decision = this.rbac.evaluate({
        actor: {
          actorId: actor.actorId,
          actorType: actor.actorType,
          role: actor.role,
          tenantId: actor.tenantId,
          branchId: actor.branchId,
          isSuperadmin:
            (actor as ActorContext & { isSuperadmin?: boolean })
              .isSuperadmin === true,
        },
        permission,
      });
      if (!decision.allowed) {
        this.denyWithDecision(decision);
      }
    }
    return true;
  }

  private denyWithDecision(decision: {
    permission: string;
    reason: string;
  }): never {
    switch (decision.reason) {
      case "self_only_mismatch":
        throw new DomainError({
          errorCode: "VET-AUTHZ-0003",
          message: "Bu kaynağa erişim yetkiniz yok",
          httpStatus: 403,
          severity: "warning",
          i18nKey: "error.VET-AUTHZ-0003",
        });
      case "branch_scope_required":
        throw new DomainError({
          errorCode: "VET-AUTHZ-0004",
          message: "Şube bağlamı zorunlu",
          httpStatus: 403,
          severity: "warning",
          i18nKey: "error.VET-AUTHZ-0004",
        });
      case "system_actor":
        throw new DomainError({
          errorCode: "VET-AUTHZ-0001",
          message: "Bu işlem için yetkiniz yok",
          httpStatus: 403,
          severity: "warning",
          i18nKey: "error.VET-AUTHZ-0001",
        });
      default:
        throw new DomainError({
          errorCode: "VET-AUTHZ-0001",
          message: "Bu işlem için yetkiniz yok",
          httpStatus: 403,
          severity: "warning",
          i18nKey: "error.VET-AUTHZ-0001",
          details: {
            permission: decision.permission,
            reason: decision.reason,
          },
        });
    }
  }
}
