/**
 * @file Appointments modülü.
 * @module apps/api/modules/appointments/appointments.module
 *
 * @description GOAL-031 randevu feature modülü. Service +
 * repository + controller DI'a eklenir. CalendarService (GOAL-030)
 * booked slot yönetimi için, PatientsService (GOAL-021) patient
 * doğrulaması için kullanılır. AuditService global modülden gelir.
 *
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
 */

import { Module } from "@nestjs/common";

import { CalendarModule } from "../calendar/calendar.module.js";
import { PatientsModule } from "../patients/patients.module.js";

import { AppointmentsController } from "./appointments.controller.js";
import { AppointmentsRepository } from "./appointments.repository.js";
import { AppointmentsService } from "./appointments.service.js";

@Module({
  imports: [CalendarModule, PatientsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsRepository],
  exports: [AppointmentsService, AppointmentsRepository],
})
export class AppointmentsModule {}
