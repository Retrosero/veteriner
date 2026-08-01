/**
 * @file Portal appointments modülü.
 * @module apps/api/modules/portal-appointments/portal-appointments.module
 *
 * @description GOAL-035 hasta sahibi portal — online randevu talebi
 * feature modülü. Cross-module bağımlılıklar:
 * - `PortalAuthModule` → portalUser → ownerId çözümlemesi
 * - `PatientsModule`  → patient doğrulaması
 * - `AppointmentsModule` → approve sonrası randevu oluşturma
 * - `NotificationsModule` → talep/onay/red bildirimleri (best-effort)
 *
 * @since GOAL-035 (FAZ-3) online randevu talebi core
 */

import { Module } from "@nestjs/common";

import {
  PortalAppointmentsClinicController,
  PortalAppointmentsPortalController,
} from "./portal-appointments.controller.js";
import { PortalAppointmentsService } from "./portal-appointments.service.js";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { PortalAuthModule } from "../portal-auth/portal-auth.module.js";

@Module({
  imports: [
    PortalAuthModule,
    PatientsModule,
    AppointmentsModule,
    NotificationsModule,
  ],
  controllers: [
    PortalAppointmentsPortalController,
    PortalAppointmentsClinicController,
  ],
  providers: [PortalAppointmentsService],
  exports: [PortalAppointmentsService],
})
export class PortalAppointmentsModule {}
