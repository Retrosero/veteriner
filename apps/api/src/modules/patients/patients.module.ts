/**
 * @file Patients modülü.
 * @module apps/api/modules/patients/patients.module
 *
 * @description Patient feature modülü. Service + repository +
 * controller DI'a eklenir. Owner doğrulaması için OwnersModule'den
 * gelen OwnersService kullanılır. AuditService global modülden
 * gelir.
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 */

import { Module } from "@nestjs/common";

import { OwnersModule } from "../owners/owners.module.js";

import { PatientsController } from "./patients.controller.js";
import { PatientsRepository } from "./patients.repository.js";
import { PatientsService } from "./patients.service.js";

@Module({
  imports: [OwnersModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsRepository],
  exports: [PatientsService, PatientsRepository],
})
export class PatientsModule {}
