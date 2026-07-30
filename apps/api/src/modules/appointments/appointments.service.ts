/**
 * @file Appointment service.
 * @module apps/api/modules/appointments/appointments.service
 *
 * @description GOAL-031 randevu oluşturma ve yönetim iş kuralları.
 * CalendarService (GOAL-030) ile entegre: appointment oluşturma/
 * iptali sırasında booked slot eklenir / kaldırılır; slot çakışma
 * kontrolü CalendarService.checkAvailability üzerinden yapılır.
 *
 * İş kuralları:
 * - `create`: Patient + Veterinarian aynı tenant'ta mı
 *   (cross-tenant → 404 VET-CLINIC-0001); start gelecekte mi
 *   (geçmiş → 422 VET-VALIDATION-0009); durationMin > 0 ve ≤ 240
 *   (Zod schema enforce eder); CalendarService.checkAvailability
 *   ile booked/blocked çakışma kontrolü (→ 409 VET-APPT-0005);
 *   end = start + durationMin; repository'ye ekle + calendar'a
 *   booked slot ekle. Audit `audit:appointment.create` (info).
 * - `findById`: tenant-scoped; cross-tenant → null.
 * - `list`: tenant-scoped; patientId/veterinarianId/status/from/to
 *   filtreleri; pagination.
 * - `update`: start / duration / veterinarian / status / notes
 *   alanları opsiyonel; start/duration/veterinarian değiştiyse
 *   çakışma kontrolü tekrar yapılır. Audit
 *   `audit:appointment.update` (info).
 * - `cancel`: status='cancelled' (idempotent); calendar'dan booked
 *   slot kaldırılır. Audit `audit:appointment.cancel` (warning).
 * - `complete`: status='completed' (geçmiş start'a izin verilir).
 *   Audit `audit:appointment.complete` (info).
 * - `markNoShow`: status='no_show'. Audit
 *   `audit:appointment.no_show` (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  Appointment,
  AppointmentCreateInput,
  AppointmentFilters,
  AppointmentUpdateInput,
} from "@vetniva/contracts";

import { CalendarService } from "../calendar/calendar.service.js";
import { PatientsService } from "../patients/patients.service.js";

import {
  type AppointmentRecord,
  AppointmentsRepository,
} from "./appointments.repository.js";

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  public constructor(
    private readonly repo: AppointmentsRepository,
    private readonly calendar: CalendarService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  public async create(
    tenantId: string,
    input: AppointmentCreateInput,
    actor: ActorContext,
  ): Promise<Appointment> {
    this.requireTenantScope(actor, tenantId);

    // 1) Patient aynı tenant'ta mı (cross-tenant → 404).
    const patient = await this.patients.findById(
      tenantId,
      input.patientId,
      actor,
    );
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId: input.patientId },
      });
    }

    // 2) Veterinarian aynı tenant'ta mı (cross-tenant → 404).
    //    Veterinarian entity'si ayrı modülde olmadığı için minimum
    //    tenant kuralı: actor.tenantId eşleşmesi + non-empty.
    if (!input.veterinarianId || input.veterinarianId.trim() === "") {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Veteriner ID zorunlu",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { field: "veterinarianId" },
      });
    }

    // 3) Start gelecekte mi (geçmiş → 422 VET-VALIDATION-0009).
    //    durationMin > 0 (defense-in-depth; Zod da enforce eder).
    if (input.durationMin <= 0) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Süre 0'dan büyük olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { field: "durationMin", value: input.durationMin },
      });
    }
    const startMs = new Date(input.start).getTime();
    if (Number.isNaN(startMs)) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Geçersiz başlangıç zamanı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { field: "start", value: input.start },
      });
    }
    if (startMs <= Date.now()) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Randevu başlangıcı gelecekte olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { start: input.start },
      });
    }

    // 4) End hesapla ve calendar uygunluk kontrolü.
    const endIso = new Date(
      startMs + input.durationMin * 60_000,
    ).toISOString();
    const branchId = input.branchId ?? actor.branchId ?? undefined;
    const availability = this.calendar.checkAvailability(
      tenantId,
      input.veterinarianId,
      input.start,
      endIso,
      branchId,
    );
    if (!availability.available) {
      throw new DomainError({
        errorCode: "VET-APPT-0005",
        message:
          availability.reason === "blocked"
            ? "Slot bloklu (mola/izin)"
            : "Slot zaten rezerve edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-APPT-0005",
        details: {
          reason: availability.reason,
          conflictId: availability.conflictId,
          start: input.start,
          end: endIso,
          veterinarianId: input.veterinarianId,
        },
      });
    }

    // 5) Repository'ye ekle + calendar'a booked slot ekle.
    const id = this.repo.nextId(tenantId);
    const now = new Date().toISOString();
    const record = this.repo.toRecord({
      id,
      tenantId,
      patientId: patient.id,
      ownerId: patient.ownerId,
      veterinarianId: input.veterinarianId,
      branchId: branchId ?? null,
      type: input.type,
      status: "scheduled",
      start: input.start,
      end: endIso,
      notes: input.notes ?? null,
      createdBy: actor.actorId,
      createdAt: now,
    });
    this.repo.insert(record);
    this.calendar.bookSlot({
      tenantId,
      branchId: branchId ?? null,
      veterinarianId: input.veterinarianId,
      appointmentId: id,
      start: input.start,
      end: endIso,
    });

    // 6) Audit.
    await this.audit.recordSimple(
      "audit:appointment.create",
      "appointment",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: record.patientId,
        ownerId: record.ownerId,
        veterinarianId: record.veterinarianId,
        type: record.type,
        start: record.start,
        end: record.end,
        durationMin: input.durationMin,
      },
    );

    return this.toAppointment(record);
  }

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Appointment | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? this.toAppointment(rec) : null;
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  public async list(
    tenantId: string,
    filters: AppointmentFilters,
    actor: ActorContext,
  ): Promise<{ items: Appointment[]; total: number }> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, filters);
    return {
      items: result.items.map((r) => this.toAppointment(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  public async update(
    tenantId: string,
    id: string,
    input: AppointmentUpdateInput,
    actor: ActorContext,
  ): Promise<Appointment> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "cancelled" || existing.status === "completed") {
      throw new DomainError({
        errorCode: "VET-APPT-0006",
        message: "İptal edilmiş veya tamamlanmış randevu güncellenemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-APPT-0006",
        details: { id, status: existing.status },
      });
    }

    const nextStart =
      input.start !== undefined ? input.start : existing.start;
    const nextDuration =
      input.durationMin !== undefined
        ? input.durationMin
        : Math.round(
            (new Date(existing.end).getTime() -
              new Date(existing.start).getTime()) /
              60_000,
          );
    const nextVet =
      input.veterinarianId !== undefined
        ? input.veterinarianId
        : existing.veterinarianId;

    const nextEnd = new Date(
      new Date(nextStart).getTime() + nextDuration * 60_000,
    ).toISOString();

    const startChanged =
      nextStart !== existing.start ||
      nextVet !== existing.veterinarianId ||
      input.durationMin !== undefined;

    if (startChanged) {
      if (new Date(nextStart).getTime() <= Date.now()) {
        throw new DomainError({
          errorCode: "VET-VALIDATION-0009",
          message: "Randevu başlangıcı gelecekte olmalı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-VALIDATION-0009",
          details: { start: nextStart },
        });
      }
      // Eski booked slot'u serbest bırak, yeni zaman için uygunluk kontrol et.
      this.calendar.releaseSlot(tenantId, existing.veterinarianId, existing.start);
      const availability = this.calendar.checkAvailability(
        tenantId,
        nextVet,
        nextStart,
        nextEnd,
        existing.branchId ?? undefined,
      );
      if (!availability.available) {
        // Eski slot'u geri koy (compensation). race condition riskini
        // minimize etmek için aynı key ile tekrar set ediyoruz.
        this.calendar.bookSlot({
          tenantId,
          branchId: existing.branchId,
          veterinarianId: existing.veterinarianId,
          appointmentId: existing.id,
          start: existing.start,
          end: existing.end,
        });
        throw new DomainError({
          errorCode: "VET-APPT-0005",
          message:
            availability.reason === "blocked"
              ? "Slot bloklu (mola/izin)"
              : "Slot zaten rezerve edilmiş",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-APPT-0005",
          details: {
            reason: availability.reason,
            conflictId: availability.conflictId,
            start: nextStart,
            end: nextEnd,
            veterinarianId: nextVet,
          },
        });
      }
    }

    const updated = this.repo.update(tenantId, id, {
      type: input.type,
      veterinarianId: nextVet,
      status: input.status,
      start: nextStart,
      end: nextEnd,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    if (startChanged) {
      this.calendar.bookSlot({
        tenantId,
        branchId: updated.branchId,
        veterinarianId: updated.veterinarianId,
        appointmentId: updated.id,
        start: updated.start,
        end: updated.end,
      });
    }

    await this.audit.recordSimple(
      "audit:appointment.update",
      "appointment",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: {
          start: existing.start,
          end: existing.end,
          veterinarianId: existing.veterinarianId,
          type: existing.type,
          status: existing.status,
        },
        after: {
          start: updated.start,
          end: updated.end,
          veterinarianId: updated.veterinarianId,
          type: updated.type,
          status: updated.status,
        },
      },
    );

    return this.toAppointment(updated);
  }

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  public async cancel(
    tenantId: string,
    id: string,
    _reason: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "cancelled") {
      // Idempotent: zaten iptal.
      return;
    }
    if (existing.status === "completed") {
      throw new DomainError({
        errorCode: "VET-APPT-0006",
        message: "Tamamlanmış randevu iptal edilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-APPT-0006",
        details: { id, status: existing.status },
      });
    }
    this.repo.update(tenantId, id, { status: "cancelled" });
    this.calendar.releaseSlot(
      tenantId,
      existing.veterinarianId,
      existing.start,
    );
    await this.audit.recordSimple(
      "audit:appointment.cancel",
      "appointment",
      id,
      "cancel",
      this.actorToAuditActor(actor),
      "warning",
      {
        start: existing.start,
        end: existing.end,
        veterinarianId: existing.veterinarianId,
        previousStatus: existing.status,
        reason: _reason,
      },
    );
  }

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  public async complete(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "completed") return; // idempotent
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-APPT-0006",
        message: "İptal edilmiş randevu tamamlanamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-APPT-0006",
        details: { id, status: existing.status },
      });
    }
    this.repo.update(tenantId, id, { status: "completed" });
    this.calendar.releaseSlot(
      tenantId,
      existing.veterinarianId,
      existing.start,
    );
    await this.audit.recordSimple(
      "audit:appointment.complete",
      "appointment",
      id,
      "complete",
      this.actorToAuditActor(actor),
      "info",
      {
        start: existing.start,
        end: existing.end,
        veterinarianId: existing.veterinarianId,
        previousStatus: existing.status,
      },
    );
  }

  // -------------------------------------------------------------------------
  // markNoShow
  // -------------------------------------------------------------------------

  public async markNoShow(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "no_show") return; // idempotent
    if (existing.status === "cancelled" || existing.status === "completed") {
      throw new DomainError({
        errorCode: "VET-APPT-0006",
        message: "İptal/tamamlanmış randevu no_show yapılamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-APPT-0006",
        details: { id, status: existing.status },
      });
    }
    this.repo.update(tenantId, id, { status: "no_show" });
    this.calendar.releaseSlot(
      tenantId,
      existing.veterinarianId,
      existing.start,
    );
    await this.audit.recordSimple(
      "audit:appointment.no_show",
      "appointment",
      id,
      "update",
      this.actorToAuditActor(actor),
      "warning",
      {
        start: existing.start,
        end: existing.end,
        veterinarianId: existing.veterinarianId,
        previousStatus: existing.status,
      },
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

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

  private toAppointment(rec: AppointmentRecord): Appointment {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      patientId: rec.patientId,
      ownerId: rec.ownerId,
      veterinarianId: rec.veterinarianId,
      type: rec.type,
      status: rec.status,
      start: rec.start,
      end: rec.end,
      notes: rec.notes,
      createdAt: rec.createdAt,
      createdBy: rec.createdBy,
    };
  }

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
