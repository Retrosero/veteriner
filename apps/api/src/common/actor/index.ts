/**
 * @file Actor public API.
 * @module apps/api/common/actor
 *
 * @description Actor modülünün dışa aktardığı tipler ve servisler.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

export { ActorContextService } from "./actor-context.service.js";
export type { ActorContext, ActorRole } from "./actor-context.service.js";
export { ActorInterceptor } from "./actor.interceptor.js";
export { ActorModule } from "./actor.module.js";
export { CurrentActor } from "./actor.decorator.js";
