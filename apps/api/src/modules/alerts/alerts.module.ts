/**
 * @file Alerts modülü.
 * @module apps/api/modules/alerts/alerts.module
 * @description GOAL-023 alerji/kronik uyarılar feature modülü.
 * Service + controller DI'a eklenir. Patient tenant doğrulaması
 * için PatientsModule'den gelen PatientsRepository kullanılır.
 * AuditService global modülden gelir.
 * @since GOAL-023 (FAZ-2) alerji/kronik uyarılar core
 */

import { Module } from "@nestjs/common";

import { AlertsController } from "./alerts.controller.js";
import { AlertsService } from "./alerts.service.js";
import { PatientsModule } from "../patients/patients.module.js";

@Module({
  imports: [PatientsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
