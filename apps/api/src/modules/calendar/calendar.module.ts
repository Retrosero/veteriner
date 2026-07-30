/**
 * @file Calendar modülü.
 * @module apps/api/modules/calendar/calendar.module
 *
 * @description GOAL-030 klinik takvimi feature modülü. Service
 * + controller DI'a eklenir. AuditService global modülden gelir.
 * GOAL-031 (Appointment) hazır olduğunda `bookedSlots` Map'i
 * AppointmentRepository ile değiştirilecek; service API
 * sözleşmesi sabit kalır.
 *
 * @since GOAL-030 (FAZ-3) klinik takvimi core
 */

import { Module } from "@nestjs/common";

import { CalendarController } from "./calendar.controller.js";
import { CalendarService } from "./calendar.service.js";

@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
