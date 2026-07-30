/**
 * @file Follow-ups (kontrol randevuları) service.
 * @module apps/api/modules/followups/followups.service
 *
 * @description GOAL-046 muayene veya reçeteden kontrol randevusu
 * türetme iş kuralları. AppointmentsService (GOAL-031) ile entegre:
 * kontrol randevusu `type='follow_up'` olarak normal appointment
 * yaratma akışından geçer (calendar uygunluk kontrolü dahil).
 *
 * İş kuralları:
 * - `scheduleFromExamination`: Examination aynı tenant'ta mı
 *   (cross-tenant → 404 VET-CLINIC-0001); followUpDate gelecekte mi
 *   (geçmiş → 422 VET-VALIDATION-0009). Veterinarian examination'dan
 *   veya `veterinarianId` override'ından; patient muayeneden.
 *   AppointmentsService.create ile `type='follow_up'`, `durationMin=30`,
 *   `notes="[follow-up] {notes}"` randevu oluşturulur. Audit
 *   `audit:followup.create` (info).
 * - `scheduleFromPrescription`: Prescription aynı tenant'ta mı
 *   (cross-tenant → 404); followUpDate gelecekte mi. Patient + vet
 *   prescription'dan. Aynı şekilde appointment oluşturulur. Audit
 *   `audit:followup.create` (info).
 * - `listPending`: status='scheduled', type='follow_up', start > now.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-046 (FAZ-4) kontrol randevusu core
 */

import { Injectable } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type { Appointment } from "@vetniva/contracts";

import { AppointmentsService } from "../appointments/appointments.service.js";
import { ExaminationsService } from "../examinations/examinations.service.js";
import { PrescriptionsService } from "../prescriptions/prescriptions.service.js";

/** Varsayılan kontrol randevusu süresi (dakika). */
const DEFAULT_FOLLOWUP_DURATION_MIN = 30;

/** Notlara eklenen kontrol prefix'i (UI'da görünür). */
const FOLLOWUP_NOTE_PREFIX = "[Kontrol Randevusu]";

@Injectable()
export class FollowupsService {
  public constructor(
    private readonly appointments: AppointmentsService,
    private readonly examinations: ExaminationsService,
    private readonly prescriptions: PrescriptionsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // scheduleFromExamination
  // -------------------------------------------------------------------------

  public async scheduleFromExamination(
    tenantId: string,
    examinationId: string,
    followUpDate: string,
    veterinarianId: string | undefined,
    notes: string | undefined,
    actor: ActorContext,
  ): Promise<Appointment> {
    this.requireTenantScope(actor, tenantId);

    // 1) Examination aynı tenant'ta mı (cross-tenant → 404).
    const exam = await this.examinations.findById(
      tenantId,
      examinationId,
      actor,
    );
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }

    // 2) followUpDate gelecekte mi (geçmiş → 422).
    this.requireFutureDate(followUpDate);

    // 3) Veterinarian: override > examination.veterinarianId.
    const vetId = veterinarianId ?? exam.veterinarianId;
    if (!vetId) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Veteriner ID zorunlu",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
      });
    }

    // 4) Appointment oluştur.
    const appt = await this.appointments.create(
      tenantId,
      {
        patientId: exam.patientId,
        veterinarianId: vetId,
        type: "follow_up",
        start: followUpDate,
        durationMin: DEFAULT_FOLLOWUP_DURATION_MIN,
        notes: this.composeNotes(notes),
      },
      actor,
    );

    // 5) Audit.
    await this.audit.recordSimple(
      "audit:followup.create",
      "appointment",
      appt.id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        source: "examination",
        examinationId,
        prescriptionId: null,
        patientId: exam.patientId,
        veterinarianId: vetId,
        start: appt.start,
        end: appt.end,
        type: "follow_up",
      },
    );

    return appt;
  }

  // -------------------------------------------------------------------------
  // scheduleFromPrescription
  // -------------------------------------------------------------------------

  public async scheduleFromPrescription(
    tenantId: string,
    prescriptionId: string,
    followUpDate: string,
    notes: string | undefined,
    actor: ActorContext,
  ): Promise<Appointment> {
    this.requireTenantScope(actor, tenantId);

    // 1) Prescription aynı tenant'ta mı (cross-tenant → 404).
    const presc = await this.prescriptions.findById(
      tenantId,
      prescriptionId,
      actor,
    );
    if (!presc) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Reçete bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { prescriptionId },
      });
    }

    // 2) followUpDate gelecekte mi (geçmiş → 422).
    this.requireFutureDate(followUpDate);

    // 3) Appointment oluştur.
    const appt = await this.appointments.create(
      tenantId,
      {
        patientId: presc.patientId,
        veterinarianId: presc.veterinarianId,
        type: "follow_up",
        start: followUpDate,
        durationMin: DEFAULT_FOLLOWUP_DURATION_MIN,
        notes: this.composeNotes(notes),
      },
      actor,
    );

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:followup.create",
      "appointment",
      appt.id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        source: "prescription",
        examinationId: presc.examinationId,
        prescriptionId,
        patientId: presc.patientId,
        veterinarianId: presc.veterinarianId,
        start: appt.start,
        end: appt.end,
        type: "follow_up",
      },
    );

    return appt;
  }

  // -------------------------------------------------------------------------
  // listPending
  // -------------------------------------------------------------------------

  public async listPending(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<Appointment[]> {
    this.requireTenantScope(actor, tenantId);
    const nowIso = new Date().toISOString();
    const result = await this.appointments.list(
      tenantId,
      {
        patientId,
        status: "scheduled",
        from: nowIso,
        limit: 200,
        offset: 0,
      },
      actor,
    );
    return result.items.filter((a) => a.type === "follow_up");
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireFutureDate(followUpDate: string): void {
    const ts = new Date(followUpDate).getTime();
    if (Number.isNaN(ts)) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Geçersiz kontrol randevu tarihi",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { followUpDate },
      });
    }
    if (ts <= Date.now()) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Kontrol randevu tarihi gelecekte olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { followUpDate },
      });
    }
  }

  private composeNotes(notes: string | undefined): string {
    if (!notes || notes.trim() === "") return FOLLOWUP_NOTE_PREFIX;
    return `${FOLLOWUP_NOTE_PREFIX} ${notes.trim()}`;
  }

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
