/**
 * @file Prescriptions modülü.
 * @module apps/api/modules/prescriptions/prescriptions.module
 *
 * @description GOAL-045 reçete feature modülü. Service + repository
 * + controller DI'a eklenir. ExaminationsService (GOAL-040)
 * examination doğrulaması için kullanılır. AuditService global
 * modülden gelir.
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import { Module } from "@nestjs/common";

import { ExaminationsModule } from "../examinations/examinations.module.js";

import { PrescriptionsController } from "./prescriptions.controller.js";
import { PrescriptionsService } from "./prescriptions.service.js";
import { PrescriptionsRepository } from "./prescriptions.repository.js";

@Module({
  imports: [ExaminationsModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionsRepository],
  exports: [PrescriptionsService, PrescriptionsRepository],
})
export class PrescriptionsModule {}
