/**
 * @file Portal appointments domain tipleri.
 * @module apps/api/modules/portal-appointments/portal-appointments.types
 *
 * @description GOAL-035 hasta sahibi portal — online randevu talebi
 * domain modeli. Service-layer DTO'ları contracts'tan re-export edilir;
 * ek olarak repository record tipi burada tutulur (in-memory persistence
 * ile sınırlı, DB migration sonrası Prisma modeline geçecek).
 *
 * @security Cross-owner erişim 404 ile maskelenir (bilgi sızdırmaz).
 *   Tüm kayıtlar tenant-scoped; tenant bilgisi yalnızca actor.tenantId
 *   veya session'dan alınır.
 *
 * @since GOAL-035 (FAZ-3) online randevu talebi core
 */

import type {
  AppointmentRequest,
  AppointmentRequestCreateInput,
  AppointmentRequestStatus,
  ContactPreference,
} from "@vetniva/contracts";

/** Service-layer DTO'lar. */
export type {
  AppointmentRequest,
  AppointmentRequestCreateInput,
  AppointmentRequestStatus,
  ContactPreference,
};

/** In-memory record (service tarafından tutulan ham kayıt). */
export interface AppointmentRequestRecord {
  id: string;
  tenantId: string;
  patientId: string;
  ownerId: string;
  status: AppointmentRequestStatus;
  preferredDate: string;
  preferredVeterinarianId: string | null;
  type: AppointmentRequest["type"];
  reason: string;
  contactPreference: ContactPreference;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  approvedAppointmentId: string | null;
}

/** Approve sonrası dönen zengin yanıt. */
export interface AppointmentRequestApproveResult {
  request: AppointmentRequest;
  appointmentId: string;
}
