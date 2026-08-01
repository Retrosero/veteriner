/**
 * @file Appointment reminder modülü.
 * @module apps/api/modules/appointment-reminders/appointment-reminders.module
 * @description GOAL-036 randevu hatırlatma feature modülü. Service
 * + repository + controller DI'a eklenir. NotificationsModule
 * (GOAL-015) + TenantsModule + PatientsModule + OwnersModule
 * bağımlılıkları çözümlenir. AppointmentsService'e doğrudan
 * bağımlılık yoktur (snapshot deseni ile circular import korunur).
 * @since GOAL-036 (FAZ-3) randevu hatırlatma core
 */

import { Module } from "@nestjs/common";

import { AppointmentRemindersController } from "./appointment-reminders.controller.js";
import { AppointmentRemindersRepository } from "./appointment-reminders.repository.js";
import { AppointmentRemindersService } from "./appointment-reminders.service.js";
import { AuditModule } from "../../common/audit/audit.module.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OwnersModule } from "../owners/owners.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { TenantModule } from "../tenant/tenant.module.js";

@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    PatientsModule,
    OwnersModule,
    TenantModule,
  ],
  controllers: [AppointmentRemindersController],
  providers: [
    AppointmentRemindersRepository,
    AppointmentRemindersService,
    ConsentService,
  ],
  exports: [AppointmentRemindersService, AppointmentRemindersRepository],
})
export class AppointmentRemindersModule {}
