/**
 * @file Examination service.
 * @module apps/api/modules/examinations/examinations.service
 *
 * @description GOAL-040 muayene başlatma ve yaşam döngüsü iş kuralları.
 * AppointmentService (GOAL-031) ile entegre: muayene başlatırken
 * patient + veterinarian appointment'tan türetilir ve tenant kapsamı
 * aynı randevu üzerinden doğrulanır.
 *
 * İş kuralları:
 * - `start`: Appointment aynı tenant'ta mı (cross-tenant → 404
 *   VET-CLINIC-0001); patient + veterinarian aynı tenant'ta mı
 *   (appointment üzerinden implicit). Status='in_progress'.
 *   Audit `audit:examination.create` (info).
 * - `findById`: tenant-scoped; cross-tenant → null.
 * - `list`: tenant-scoped; patientId / veterinarianId / status /
 *   from / to filtreleri; pagination.
 * - `complete`: status='in_progress' değilse → 409 VET-EXAM-0001.
 *   status='completed', completedAt set. Audit
 *   `audit:examination.update` (info).
 * - `sign`: status='completed' değilse → 409 VET-EXAM-0002. signedAt
 *   + signedBy set. İmza sonrası UPDATE/DELETE tetiklenir (FAZ-0'da
 *   no-op flag, sadece log). Audit `audit:examination.sign` (info).
 * - `amend`: status='amended' (append-only, yeni ExaminationAmend
 *   kaydı oluşturulur; önceki imza referansı saklanır). Audit
 *   `audit:examination.amend` (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type ExaminationAmendRecord,
  type ExaminationRecord,
  ExaminationAmendsRepository,
  ExaminationsRepository,
  toExamination,
  toExaminationAmend,
} from "./examinations.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { AppointmentsService } from "../appointments/appointments.service.js";
import { PatientsService } from "../patients/patients.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Examination,
  ExaminationAmend,
  ExaminationAmendInput,
  ExaminationCreateInput,
  ExaminationFilters,
  ExaminationListResponse,
} from "@vetniva/contracts";

@Injectable()
export class ExaminationsService {
  private readonly logger = new Logger(ExaminationsService.name);

  public constructor(
    private readonly repo: ExaminationsRepository,
    private readonly amends: ExaminationAmendsRepository,
    private readonly appointments: AppointmentsService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------

  public async start(
    tenantId: string,
    input: ExaminationCreateInput,
    actor: ActorContext,
  ): Promise<Examination> {
    this.requireTenantScope(actor, tenantId);

    // 1) Appointment aynı tenant'ta mı (cross-tenant → 404).
    const appt = await this.appointments.findById(
      tenantId,
      input.appointmentId,
      actor,
    );
    if (!appt) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { appointmentId: input.appointmentId },
      });
    }

    // 2) Patient aynı tenant'ta mı (cross-tenant → 404). Appointment
    //    zaten aynı tenant'ta bulunduğu için patient da aynı tenant'ta;
    //    burada açık doğrulama patient record'unun silinmemiş/arşivsiz
    //    olduğunu garanti eder.
    const patient = await this.patients.findById(
      tenantId,
      appt.patientId,
      actor,
    );
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId: appt.patientId },
      });
    }

    // 3) Repository'ye ekle.
    const id = this.repo.nextId(tenantId);
    const now = new Date().toISOString();
    const record: ExaminationRecord = this.repo.toRecord({
      id,
      tenantId,
      patientId: appt.patientId,
      veterinarianId: appt.veterinarianId,
      appointmentId: appt.id,
      status: "in_progress",
      type: input.type,
      chiefComplaint: input.chiefComplaint,
      startedAt: now,
      completedAt: null,
      signedAt: null,
      signedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    this.repo.insert(record);

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:examination.create",
      "examination",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        appointmentId: record.appointmentId,
        patientId: record.patientId,
        veterinarianId: record.veterinarianId,
        type: record.type,
        status: record.status,
      },
    );

    return toExamination(record);
  }

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Examination | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toExamination(rec) : null;
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  public async list(
    tenantId: string,
    filters: ExaminationFilters,
    actor: ActorContext,
  ): Promise<ExaminationListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      patientId: filters.patientId,
      veterinarianId: filters.veterinarianId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toExamination(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  public async complete(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Examination> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "in_progress") {
      throw new DomainError({
        errorCode: "VET-EXAM-0001",
        message: "Yalnızca devam eden muayene tamamlanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-EXAM-0001",
        details: { id, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    const updated = this.repo.update(tenantId, id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:examination.update",
      "examination",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: { status: existing.status, completedAt: existing.completedAt },
        after: { status: updated.status, completedAt: updated.completedAt },
      },
    );

    return toExamination(updated);
  }

  // -------------------------------------------------------------------------
  // sign
  // -------------------------------------------------------------------------

  public async sign(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Examination> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "completed") {
      throw new DomainError({
        errorCode: "VET-EXAM-0002",
        message: "Yalnızca tamamlanmış muayene imzalanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-EXAM-0002",
        details: { id, status: existing.status },
      });
    }
    if (existing.signedAt !== null) {
      throw new DomainError({
        errorCode: "VET-EXAM-0002",
        message: "Muayene zaten imzalanmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-EXAM-0002",
        details: { id, signedAt: existing.signedAt },
      });
    }

    const now = new Date().toISOString();
    const updated = this.repo.update(tenantId, id, {
      signedAt: now,
      signedBy: actor.actorId,
      updatedAt: now,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    // İmza sonrası UPDATE/DELETE trigger (FAZ-0'da no-op flag, sadece log).
    // Production'da DB trigger'ı (append-only) bu noktada activate olur.
    this.logger.log({
      msg: "examination.signed.lock_immutable",
      examinationId: id,
      tenantId,
      signedBy: actor.actorId,
    });

    await this.audit.recordSimple(
      "audit:examination.sign",
      "examination",
      id,
      "sign",
      this.actorToAuditActor(actor),
      "info",
      {
        signedAt: updated.signedAt,
        signedBy: updated.signedBy,
        previousStatus: existing.status,
      },
    );

    return toExamination(updated);
  }

  // -------------------------------------------------------------------------
  // amend
  // -------------------------------------------------------------------------

  public async amend(
    tenantId: string,
    id: string,
    input: ExaminationAmendInput,
    actor: ActorContext,
  ): Promise<Examination> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    const now = new Date().toISOString();
    const amendId = this.amends.nextId(tenantId);
    const amendRecord: ExaminationAmendRecord = {
      id: amendId,
      tenantId,
      examinationId: id,
      reason: input.reason,
      amendedBy: actor.actorId ?? "system",
      amendedAt: now,
      previousSignedAt: existing.signedAt,
      previousSignedBy: existing.signedBy,
    };
    this.amends.insert(amendRecord);

    const updated = this.repo.update(tenantId, id, {
      status: "amended",
      updatedAt: now,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:examination.amend",
      "examination",
      id,
      "amend",
      this.actorToAuditActor(actor),
      "warning",
      {
        amendId,
        reason: input.reason,
        previousStatus: existing.status,
        previousSignedAt: existing.signedAt,
        previousSignedBy: existing.signedBy,
      },
    );

    return toExamination(updated);
  }

  // -------------------------------------------------------------------------
  // listAmends
  // -------------------------------------------------------------------------

  public async listAmends(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<ExaminationAmend[]> {
    this.requireTenantScope(actor, tenantId);
    const recs = this.amends.findByExaminationId(tenantId, examinationId);
    return recs.map((r) => toExaminationAmend(r));
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
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
