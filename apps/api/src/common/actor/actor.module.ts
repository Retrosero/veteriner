/**
 * @file Actor modülü.
 * @module apps/api/common/actor/actor.module
 *
 * @description ActorContextService ve ActorInterceptor'ı DI container'a
 * ekler. AppModule tarafından global olarak import edilir.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Global, Module } from "@nestjs/common";

import { ActorContextService } from "./actor-context.service.js";
import { ActorInterceptor } from "./actor.interceptor.js";

@Global()
@Module({
  providers: [ActorContextService, ActorInterceptor],
  exports: [ActorContextService, ActorInterceptor],
})
export class ActorModule {}
