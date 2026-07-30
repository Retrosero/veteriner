/**
 * @file Portal modülü.
 * @module apps/api/modules/portal/portal.module
 *
 * @description GOAL-025 portal erişim daveti feature modülü.
 * Service + repository + controller DI'a eklenir. Owner doğrulaması
 * için OwnersModule'den OwnersService; hasta doğrulaması için
 * PatientsModule'den PatientsService inject edilir. AuditService
 * global modülden gelir.
 *
 * @since GOAL-025 (FAZ-2) portal erişim daveti
 */

import { Module } from "@nestjs/common";

import { OwnersModule } from "../owners/owners.module.js";
import { PatientsModule } from "../patients/patients.module.js";

import { PortalController } from "./portal.controller.js";
import { PortalRepository } from "./portal.repository.js";
import { PortalService } from "./portal.service.js";

@Module({
  imports: [OwnersModule, PatientsModule],
  controllers: [PortalController],
  providers: [PortalService, PortalRepository],
  exports: [PortalService, PortalRepository],
})
export class PortalModule {}
