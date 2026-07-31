/**
 * @file ErrorEvents modülü.
 * @module apps/api/modules/error-events/error-events.module
 *
 * @description GOAL-100 (FAZ-10) merkezi backend hata yakalama
 * feature modülü. Cross-module:
 * - AllExceptionsFilter (filter tarafında ErrorEventsService.recordError
 *   çağrılır; burada DI uyumu için module global erişilebilir olmalı).
 *
 * GOAL-101 ile birlikte frontend hata raporları için
 * `SystemErrorEventsController` de aynı modülden dışa açılır;
 * servis + repository tek noktadan paylaşılır.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 *        GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import { Global, Module } from "@nestjs/common";

import {
  ErrorEventsController,
  SystemErrorEventsController,
} from "./error-events.controller.js";
import { ErrorEventsRepository } from "./error-events.repository.js";
import { ErrorEventsService } from "./error-events.service.js";

@Global()
@Module({
  controllers: [ErrorEventsController, SystemErrorEventsController],
  providers: [ErrorEventsService, ErrorEventsRepository],
  exports: [ErrorEventsService, ErrorEventsRepository],
})
export class ErrorEventsModule {}
