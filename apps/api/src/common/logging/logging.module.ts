/**
 * @file Logging modülü.
 * @module apps/api/common/logging/logging.module
 *
 * @description LoggerService ve PiiMasker'ı DI container'a
 * ekler. NestJS'in varsayılan Logger'ı yerine bu modül
 * kullanılır.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import { Global, Module } from "@nestjs/common";

import { LoggerService } from "./logger.service.js";
import { PiiMasker } from "./pii-masker.js";

@Global()
@Module({
  providers: [PiiMasker, LoggerService],
  exports: [PiiMasker, LoggerService],
})
export class LoggingModule {}
