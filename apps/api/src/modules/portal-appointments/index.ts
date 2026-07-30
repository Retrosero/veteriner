/**
 * @file Portal appointments modülü public exports.
 * @module apps/api/modules/portal-appointments
 *
 * @since GOAL-035 (FAZ-3) online randevu talebi core
 */

export { PortalAppointmentsModule } from "./portal-appointments.module.js";
export { PortalAppointmentsService } from "./portal-appointments.service.js";
export {
  PortalAppointmentsClinicController,
  PortalAppointmentsPortalController,
} from "./portal-appointments.controller.js";
export type {
  AppointmentRequestApproveResult,
  AppointmentRequestRecord,
} from "./portal-appointments.types.js";
