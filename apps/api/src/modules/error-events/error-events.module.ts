/**
 * @file ErrorEvents modülü.
 * @module apps/api/modules/error-events/error-events.module
 *
 * @description GOAL-100 (FAZ-10) merkezi backend hata yakalama
 * feature modülü. Cross-module:
 * - AllExceptionsFilter (filter tarafında ErrorEventsService.recordError
 *   çağrılır; burada DI uyumu için module global erişilebilir olmalı).
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import { Global, Module } from "@nestjs/common";

import { ErrorEventsController } from "./error-events.controller.js";
import { ErrorEventsRepository } from "./error-events.repository.js";
import { ErrorEventsService } from "./error-events.service.js";

@Global()
@Module({
  controllers: [ErrorEventsController],
  providers: [ErrorEventsService, ErrorEventsRepository],
  exports: [ErrorEventsService, ErrorEventsRepository],
})
export class ErrorEventsModule {}
