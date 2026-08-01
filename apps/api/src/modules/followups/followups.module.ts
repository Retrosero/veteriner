/**
 * @file Follow-ups (kontrol randevuları) modülü.
 * @module apps/api/modules/followups/followups.module
 *
 * @description GOAL-046 kontrol randevusu feature modülü. Service +
 * controller DI'a eklenir. AppointmentsService (GOAL-031) appointment
 * oluşturma için, ExaminationsService (GOAL-040) ve PrescriptionsService
 * (GOAL-045) cross-tenant doğrulama ve patient/vet türetmek için
 * kullanılır. AuditService global modülden gelir.
 *
 * @since GOAL-046 (FAZ-4) kontrol randevusu core
 */

import { Module } from "@nestjs/common";

import { FollowupsController } from "./followups.controller.js";
import { FollowupsService } from "./followups.service.js";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { ExaminationsModule } from "../examinations/examinations.module.js";
import { PrescriptionsModule } from "../prescriptions/prescriptions.module.js";

@Module({
  imports: [AppointmentsModule, ExaminationsModule, PrescriptionsModule],
  controllers: [FollowupsController],
  providers: [FollowupsService],
  exports: [FollowupsService],
})
export class FollowupsModule {}
