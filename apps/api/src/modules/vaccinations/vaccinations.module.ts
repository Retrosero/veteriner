/**
 * @file Vaccinations modülü.
 * @module apps/api/modules/vaccinations/vaccinations.module
 *
 * @description GOAL-051 aşı uygulama kaydı feature modülü.
 * Service + repository + controller DI'a eklenir.
 * `VaccinesService` (protokol) ve `PatientsService` (hasta
 * doğrulaması) modülleri dışarıdan gelir. `AuditService`
 * global modülden gelir.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { Module } from "@nestjs/common";

import { VaccinationsController } from "./vaccinations.controller.js";
import { VaccinationsRepository } from "./vaccinations.repository.js";
import { VaccinationsService } from "./vaccinations.service.js";
import { AuditModule } from "../../common/audit/audit.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { VaccinesModule } from "../vaccines/vaccines.module.js";

@Module({
  imports: [AuditModule, PatientsModule, VaccinesModule],
  controllers: [VaccinationsController],
  providers: [VaccinationsService, VaccinationsRepository],
  exports: [VaccinationsService, VaccinationsRepository],
})
export class VaccinationsModule {}
