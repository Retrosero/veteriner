/**
 * @file SecurityEvents modülü.
 * @module apps/api/modules/security-events/security-events.module
 *
 * @description GOAL-105 (FAZ-10) güvenlik logları ve alarm
 * kuralları feature modülü. Service + repository DI'a eklenir;
 * default alarm adapter `NoopSecurityAlertAdapter` ile bağlanır
 * (production'da Slack/PagerDuty adapter override edilebilir).
 *
 * Cross-module:
 * - `moduleFromRoute` (ErrorEventsService) modül tespiti için
 *   yeniden kullanılır; SecurityEventModule ile ErrorEventModule
 *   aynı enum kataloğunu paylaşır.
 * - `PiiMasker` (common/logging) context sanitization.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import { Global, Module } from "@nestjs/common";

import {
  SecurityEventsController,
  SystemSecurityEventsController,
} from "./security-events.controller.js";
import { SecurityEventsRepository } from "./security-events.repository.js";
import {
  SECURITY_ALERT_ADAPTER,
  NoopSecurityAlertAdapter,
  SecurityEventsService,
} from "./security-events.service.js";

@Global()
@Module({
  controllers: [SecurityEventsController, SystemSecurityEventsController],
  providers: [
    SecurityEventsService,
    SecurityEventsRepository,
    NoopSecurityAlertAdapter,
    {
      provide: SECURITY_ALERT_ADAPTER,
      useExisting: NoopSecurityAlertAdapter,
    },
  ],
  exports: [SecurityEventsService, SecurityEventsRepository],
})
export class SecurityEventsModule {}
