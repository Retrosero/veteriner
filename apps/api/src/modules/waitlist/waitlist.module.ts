/**
 * @file Waitlist modülü.
 * @module apps/api/modules/waitlist/waitlist.module
 *
 * @description GOAL-032 bekleme listesi feature modülü. Service +
 * repository + controller DI'a eklenir. Patient doğrulaması için
 * PatientsService (GOAL-021), bildirim stub'ı için
 * NotificationsService (GOAL-015) kullanılır. AuditService global
 * modülden gelir.
 *
 * DB migration ve cron job entegrasyonu FAZ-3 sonrasına bırakıldı;
 * in-memory Map + manuel `expireOverdue` çağrısı yeterli.
 *
 * @since GOAL-032 (FAZ-3) bekleme listesi core
 */

import { Module } from "@nestjs/common";

import { WaitlistController } from "./waitlist.controller.js";
import { WaitlistRepository } from "./waitlist.repository.js";
import { WaitlistService } from "./waitlist.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PatientsModule } from "../patients/patients.module.js";

@Module({
  imports: [PatientsModule, NotificationsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistRepository],
  exports: [WaitlistService, WaitlistRepository],
})
export class WaitlistModule {}
