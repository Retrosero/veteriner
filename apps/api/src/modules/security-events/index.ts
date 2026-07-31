/**
 * @file SecurityEvents modülü public re-export.
 * @module apps/api/modules/security-events/index
 *
 * @description Nest modülü tüketicileri için barrel export.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

export {
  SecurityEventsModule,
} from "./security-events.module.js";
export {
  SecurityEventsService,
  NoopSecurityAlertAdapter,
  SECURITY_ALERT_ADAPTER,
  type SecurityAlertAdapter,
} from "./security-events.service.js";
export { SecurityEventsRepository } from "./security-events.repository.js";
export {
  SecurityEventsController,
  SystemSecurityEventsController,
} from "./security-events.controller.js";
