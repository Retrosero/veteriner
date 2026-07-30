/**
 * @file Diagnoses modülü.
 * @module apps/api/modules/diagnoses/diagnoses.module
 *
 * @description GOAL-043 teşhis feature modülü. Service + repository
 * + controller DI'a eklenir. ExaminationsService (GOAL-040)
 * examination doğrulaması için kullanılır (cross-tenant → 404).
 * AuditService global modülden gelir.
 *
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import { Module } from "@nestjs/common";

import { ExaminationsModule } from "../examinations/examinations.module.js";

import { DiagnosesController } from "./diagnoses.controller.js";
import { DiagnosesRepository } from "./diagnoses.repository.js";
import { DiagnosesService } from "./diagnoses.service.js";

@Module({
  imports: [ExaminationsModule],
  controllers: [DiagnosesController],
  providers: [DiagnosesService, DiagnosesRepository],
  exports: [DiagnosesService, DiagnosesRepository],
})
export class DiagnosesModule {}
