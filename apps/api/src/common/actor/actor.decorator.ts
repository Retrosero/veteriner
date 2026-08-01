/**
 * @file Current actor dekoratörü.
 * @module apps/api/common/actor/actor.decorator
 * @description Controller metotlarında actor bilgisine tip-güvenli
 * erişim sağlar. `ActorInterceptor` ile birlikte çalışır.
 * @example
 * ```ts
 * @Get()
 * public list(@CurrentActor() actor: ActorContext) {
 *   if (actor.role !== 'SUPERADMIN') throw new ForbiddenException(...);
 *   ...
 * }
 * ```
 * GOAL-010 (Faz 1) tenant ve şube altyapısının parçasıdır.
 */

import { type ExecutionContext, createParamDecorator } from "@nestjs/common";

import type { ActorContext } from "./actor-context.service.js";
import type { Request } from "express";

/**
 * İstekten actor bilgisini alır. `ActorInterceptor` tarafından
 * set edilmiş olmalıdır.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { actor?: ActorContext }>();
    return request.actor;
  },
);
