/**
 * @file Vitals modülü.
 * @module apps/api/modules/vitals/vitals.module
 *
 * @description GOAL-042 vital bulgular feature modülü. Service +
 * repository + controller DI'a eklenir. ExaminationsService
 * (GOAL-040) muayene varlık doğrulaması için, PatientsService
 * (GOAL-021) hasta varlık doğrulaması için kullanılır. AuditService
 * global modülden gelir.
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

import { Module } from "@nestjs/common";

import { VitalsController } from "./vitals.controller.js";
import { VitalsRepository } from "./vitals.repository.js";
import { VitalsService } from "./vitals.service.js";
import { ExaminationsModule } from "../examinations/examinations.module.js";
import { PatientsModule } from "../patients/patients.module.js";

@Module({
  imports: [ExaminationsModule, PatientsModule],
  controllers: [VitalsController],
  providers: [VitalsService, VitalsRepository],
  exports: [VitalsService, VitalsRepository],
})
export class VitalsModule {}
