/**
 * @file Prescriptions modülü.
 * @module apps/api/modules/prescriptions/prescriptions.module
 *
 * @description GOAL-045 reçete feature modülü. Service + repository
 * + controller DI'a eklenir. ExaminationsService (GOAL-040)
 * examination doğrulaması için kullanılır. ClinicalConsumptionService
 * (GOAL-066) reçete dispans anında otomatik stok düşümü için
 * kullanılır. AuditService global modülden gelir.
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 * @updated GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü
 */

import { Module } from "@nestjs/common";

import { PrescriptionsController } from "./prescriptions.controller.js";
import { PrescriptionsRepository } from "./prescriptions.repository.js";
import { PrescriptionsService } from "./prescriptions.service.js";
import { ClinicalConsumptionModule } from "../clinical-consumption/clinical-consumption.module.js";
import { ExaminationsModule } from "../examinations/examinations.module.js";

@Module({
  imports: [ExaminationsModule, ClinicalConsumptionModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionsRepository],
  exports: [PrescriptionsService, PrescriptionsRepository],
})
export class PrescriptionsModule {}
