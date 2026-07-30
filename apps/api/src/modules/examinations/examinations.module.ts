/**
 * @file Examinations modülü.
 * @module apps/api/modules/examinations/examinations.module
 *
 * @description GOAL-040 muayene feature modülü. Service +
 * repository + controller DI'a eklenir. AppointmentsService
 * (GOAL-031) appointment doğrulaması için, PatientsService
 * (GOAL-021) patient doğrulaması için kullanılır. AuditService
 * global modülden gelir.
 *
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
 */

import { Module } from "@nestjs/common";

import { AppointmentsModule } from "../appointments/appointments.module.js";
import { PatientsModule } from "../patients/patients.module.js";

import { ExaminationsController } from "./examinations.controller.js";
import {
  ExaminationAmendsRepository,
  ExaminationsRepository,
} from "./examinations.repository.js";
import { ExaminationsService } from "./examinations.service.js";

@Module({
  imports: [AppointmentsModule, PatientsModule],
  controllers: [ExaminationsController],
  providers: [
    ExaminationsService,
    ExaminationsRepository,
    ExaminationAmendsRepository,
  ],
  exports: [ExaminationsService, ExaminationsRepository],
})
export class ExaminationsModule {}
