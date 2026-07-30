/**
 * @file @CurrentUser() dekoratörü.
 * @module apps/api/common/decorators/current-user
 *
 * @description AuthGuard sonrası `request.actor` üzerindeki
 * `ActorContext`'i controller metoduna aktarır.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { ActorContext } from "../actor/actor-context.service.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { actor?: ActorContext }>();
    return request.actor;
  },
);
