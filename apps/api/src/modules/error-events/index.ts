/**
 * @file ErrorEvents modülü barrel export.
 * @module apps/api/modules/error-events
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

export { ErrorEventsModule } from "./error-events.module.js";
export { ErrorEventsService } from "./error-events.service.js";
export { ErrorEventsRepository } from "./error-events.repository.js";
export {
  ErrorEventsController,
  SystemErrorEventsController,
  TenantErrorEventsController,
} from "./error-events.controller.js";
export {
  moduleFromRoute,
  computeFingerprint,
  normalizeMessage,
} from "./error-events.service.js";
