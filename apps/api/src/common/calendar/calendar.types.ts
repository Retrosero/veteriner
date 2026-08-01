/**
 * @file Calendar (klinik takvim) domain tipleri.
 * @module apps/api/common/calendar/calendar.types
 *
 * @description GOAL-030 klinik takvimi (calendar / time slot yönetimi)
 * için domain tipleri. Working hours + slot üretimi + blocked slot
 * yönetimi. In-memory Map'lerde tutulur; production'a geçişte
 * Prisma `WorkingHours` + `CalendarBlockedSlot` tabloları ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @since GOAL-030 (FAZ-3) klinik takvimi core
 */

import type {
  CalendarDay,
  CalendarSlot,
  CalendarSlotStatus,
  WorkingHours,
} from "@vetniva/contracts";

export type { CalendarDay, CalendarSlot, CalendarSlotStatus, WorkingHours };

/** 0=Pazar, 1=Pazartesi ... 6=Cumartesi. ISO-8601 uyumu. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Veterinarian için tenant-scoped working hours girişi. */
export interface WorkingHoursEntry {
  tenantId: string;
  veterinarianId: string;
  hours: ReadonlyArray<WorkingHours>;
}

/** Blocked slot kaydı. In-memory Map'te tutulur. */
export interface BlockedSlotRecord {
  id: string;
  tenantId: string;
  /** Şube (branch) filtresi. NULL = tenant-wide (tüm şubeler). */
  branchId: string | null;
  veterinarianId: string;
  /** ISO 8601 datetime (UTC). */
  start: string;
  /** ISO 8601 datetime (UTC). */
  end: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

/** Slot üretimi için slot definition. */
export interface SlotDefinition {
  start: string;
  end: string;
  status: CalendarSlotStatus;
  appointmentId?: string;
  veterinarianId: string;
}

/** getDay sorgu parametreleri. */
export interface GetDayQuery {
  date: string; // YYYY-MM-DD
  veterinarianId?: string;
}
