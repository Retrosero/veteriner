/**
 * @file Appointment reminders modülü public API.
 * @module apps/api/modules/appointment-reminders
 *
 * @since GOAL-036 (FAZ-3) randevu hatırlatma core
 */

export {
  type AppointmentReminderRecord,
  AppointmentRemindersRepository,
} from "./appointment-reminders.repository.js";
export {
  AppointmentRemindersService,
  type ScheduledReminder,
} from "./appointment-reminders.service.js";
export { AppointmentRemindersModule } from "./appointment-reminders.module.js";
