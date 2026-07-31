/**
 * @file Consents modülü.
 * @module apps/api/modules/consents/consents.module
 *
 * @description GOAL-081 (FAZ-8) onam formu feature modülü.
 *
 * @since GOAL-081 (FAZ-8) onam formları core
 */

import { Module } from "@nestjs/common";

import { ConsentsController } from "./consents.controller.js";
import { ConsentsRepository } from "./consents.repository.js";
import { ConsentsService } from "./consents.service.js";

@Module({
  controllers: [ConsentsController],
  providers: [ConsentsService, ConsentsRepository],
  exports: [ConsentsService, ConsentsRepository],
})
export class ConsentsModule {}
