/**
 * @file Portal auth modülü public exports.
 * @module apps/api/modules/portal-auth
 *
 * @since GOAL-033 (FAZ-3) hasta sahihi portal kayıt ve giriş
 */

export { PortalAuthModule } from "./portal-auth.module.js";
export { PortalAuthService } from "./portal-auth.service.js";
export { PortalAuthRepository } from "./portal-auth.repository.js";
export { PortalAuthController } from "./portal-auth.controller.js";
export type {
  PortalUserRecord,
  PortalSessionRecord,
  PortalPasswordResetRecord,
  PortalUser,
  PortalSession,
  PortalLoginInput,
  PortalAttemptContext,
} from "./portal-auth.types.js";
