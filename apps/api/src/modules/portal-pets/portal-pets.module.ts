/**
 * @file Portal pets modülü.
 * @module apps/api/modules/portal-pets/portal-pets.module
 *
 * @description GOAL-034 hasta sahibi portal — hayvan listesi ve
 * detayı feature modülü. Service + controller DI'a eklenir.
 * Cross-module bağımlılıklar:
 * - `PortalAuthModule` → `findById` ile `ownerId` çözümlemesi
 * - `PatientsModule`  → aktif hayvan araması ve detay
 * - `AlertsModule`    → aktif uyarı sayısı
 * - `AppointmentsModule` → son completed randevu türetme
 *
 * @since GOAL-034 (FAZ-3) portal hayvan listesi ve detayı
 */

import { Module } from "@nestjs/common";

import { AlertsModule } from "../alerts/alerts.module.js";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { PortalAuthModule } from "../portal-auth/portal-auth.module.js";

import { PortalPetsController } from "./portal-pets.controller.js";
import { PortalPetsService } from "./portal-pets.service.js";

@Module({
  imports: [
    PortalAuthModule,
    PatientsModule,
    AlertsModule,
    AppointmentsModule,
  ],
  controllers: [PortalPetsController],
  providers: [PortalPetsService],
  exports: [PortalPetsService],
})
export class PortalPetsModule {}
