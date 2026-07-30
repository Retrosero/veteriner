/**
 * @file Appointments modülü public API.
 * @module apps/api/modules/appointments
 *
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
 */

export { AppointmentsModule } from "./appointments.module.js";
export { AppointmentsService } from "./appointments.service.js";
export { AppointmentsRepository } from "./appointments.repository.js";
export { AppointmentsController } from "./appointments.controller.js";
export type { AppointmentRecord } from "./appointments.repository.js";
