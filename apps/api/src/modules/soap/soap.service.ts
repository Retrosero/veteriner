/**
 * @file SOAP klinik kaydı service.
 * @module apps/api/modules/soap/soap.service
 *
 * @description GOAL-041 SOAP (Subjective, Objective, Assessment, Plan)
 * klinik kaydı iş kuralları. ExaminationsService (GOAL-040) ile entegre:
 * SOAP imzalandığında muayene de imzalanır (cross-service delegation);
 * SOAP düzeltme (amend) append-only politika ile yapılır.
 *
 * İş kuralları:
 * - `create`: Examination aynı tenant'ta mı (cross-tenant → 404
 *   VET-CLINIC-0001); examination status='in_progress' olmalı
 *   (completed/signed → 409 VET-SOAP-0001). Her bölüm (S/O/A/P)
 *   opsiyonel. status='draft'. Audit `audit:soap.create` (info).
 * - `findByExamination`: tenant-scoped; cross-tenant → null.
 * - `update`: yalnızca status='draft' (signed/amended → 409
 *   VET-SOAP-0001). Audit `audit:soap.update` (info).
 * - `sign`: status='draft' → 'signed'; signedAt+signedBy set.
 *   Cross-service: ExaminationsService.sign çağrılır (muayene de
 *   imzalanır). Audit `audit:soap.sign` (info).
 * - `amend`: status='signed' (signed değilse → 409 VET-SOAP-0001).
 *   status='amended', yeni SoapAmendRecord (append-only); orijinal
 *   SOAP bölümleri korunur, yeni içerik amend kaydında saklanır.
 *   Audit `audit:soap.amend` (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type SoapAmendRecord,
  type SoapNoteRecord,
  SoapAmendsRepository,
  SoapNotesRepository,
  toSoapNote,
} from "./soap.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ExaminationsService } from "../examinations/examinations.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { SoapInitial } from "../../common/soap/soap.types.js";
import type {
  SoapAmendInput,
  SoapAmendRecord as SoapAmendRecordContract,
  SoapNote,
  SoapUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class SoapService {
  private readonly logger = new Logger(SoapService.name);

  public constructor(
    private readonly repo: SoapNotesRepository,
    private readonly amends: SoapAmendsRepository,
    private readonly examinations: ExaminationsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  public async create(
    tenantId: string,
    examinationId: string,
    initial: SoapInitial,
    actor: ActorContext,
  ): Promise<SoapNote> {
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

    // 2) Examination status=in_progress olmalı (completed/signed/amended
    //    → 409 VET-SOAP-0001).
    if (exam.status !== "in_progress") {
      throw new DomainError({
        errorCode: "VET-SOAP-0001",
        message: "SOAP yalnızca devam eden muayene için oluşturulabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SOAP-0001",
        details: { examinationId, examStatus: exam.status },
      });
    }

    const id = this.repo.nextId(tenantId);
    const now = new Date().toISOString();
    const record: SoapNoteRecord = this.repo.toRecord({
      id,
      tenantId,
      examinationId,
      subjective: initial.subjective ?? "",
      objective: initial.objective ?? "",
      assessment: initial.assessment ?? "",
      plan: initial.plan ?? "",
      status: "draft",
      createdAt: now,
      createdBy: actor.actorId ?? "system",
      signedAt: null,
      signedBy: null,
      amendedAt: null,
    });
    await this.repo.persist(record);

    await this.audit.recordSimple(
      "audit:soap.create",
      "soap",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId,
        status: record.status,
      },
    );

    return toSoapNote(record);
  }

  // -------------------------------------------------------------------------
  // findByExamination
  // -------------------------------------------------------------------------

  public async findByExamination(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<SoapNote | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedByExam(tenantId, examinationId);
    return rec ? toSoapNote(rec) : null;
  }

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  public async update(
    tenantId: string,
    examinationId: string,
    input: SoapUpdateInput,
    actor: ActorContext,
  ): Promise<SoapNote> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedByExam(tenantId, examinationId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "SOAP notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-SOAP-0001",
        message: "Yalnızca taslak SOAP notu güncellenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SOAP-0001",
        details: {
          examinationId,
          status: existing.status,
        },
      });
    }

    const updated = await this.repo.persistedUpdate(tenantId, existing.id, {
      subjective: input.subjective,
      objective: input.objective,
      assessment: input.assessment,
      plan: input.plan,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "SOAP notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }

    await this.audit.recordSimple(
      "audit:soap.update",
      "soap",
      existing.id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId,
        before: {
          subjective: existing.subjective,
          objective: existing.objective,
          assessment: existing.assessment,
          plan: existing.plan,
        },
        after: {
          subjective: updated.subjective,
          objective: updated.objective,
          assessment: updated.assessment,
          plan: updated.plan,
        },
      },
    );

    return toSoapNote(updated);
  }

  // -------------------------------------------------------------------------
  // sign
  // -------------------------------------------------------------------------

  public async sign(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<SoapNote> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedByExam(tenantId, examinationId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "SOAP notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-SOAP-0001",
        message: "Yalnızca taslak SOAP notu imzalanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SOAP-0001",
        details: { examinationId, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    // Cross-service: muayeneyi de imzala. Examination service kendi
    // kurallarını uygular (status=completed olmalı; aksi → 409).
    await this.examinations.sign(tenantId, examinationId, actor);

    const updated = await this.repo.persistedUpdate(tenantId, existing.id, {
      status: "signed",
      signedAt: now,
      signedBy: actor.actorId,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "SOAP notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }

    // İmza sonrası UPDATE/DELETE trigger (FAZ-0'da no-op flag, sadece log).
    this.logger.log({
      msg: "soap.signed.lock_immutable",
      soapId: existing.id,
      tenantId,
      signedBy: actor.actorId,
    });

    await this.audit.recordSimple(
      "audit:soap.sign",
      "soap",
      existing.id,
      "sign",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId,
        signedAt: updated.signedAt,
        signedBy: updated.signedBy,
        previousStatus: existing.status,
      },
    );

    return toSoapNote(updated);
  }

  // -------------------------------------------------------------------------
  // amend
  // -------------------------------------------------------------------------

  public async amend(
    tenantId: string,
    examinationId: string,
    input: SoapAmendInput,
    actor: ActorContext,
  ): Promise<{ soap: SoapNote; amend: SoapAmendRecordContract }> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedByExam(tenantId, examinationId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "SOAP notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }
    if (existing.status !== "signed") {
      throw new DomainError({
        errorCode: "VET-SOAP-0001",
        message: "Yalnızca imzalı SOAP notu düzeltilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SOAP-0001",
        details: { examinationId, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    const amendId = this.amends.nextId(tenantId);

    // Append-only: orijinal SOAP bölümleri korunur; yeni içerik
    // amend kaydında saklanır. SoapNote.status='amended'.
    const amendRecord: SoapAmendRecord = {
      id: amendId,
      tenantId,
      originalSoapId: existing.id,
      examinationId,
      reason: input.reason,
      subjective: input.subjective,
      objective: input.objective,
      assessment: input.assessment,
      plan: input.plan,
      amendedBy: actor.actorId ?? "system",
      amendedAt: now,
      previousSignedAt: existing.signedAt,
      previousSignedBy: existing.signedBy,
    };
    await this.amends.persist(amendRecord);

    const updated = await this.repo.persistedUpdate(tenantId, existing.id, {
      status: "amended",
      amendedAt: now,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "SOAP notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }

    await this.audit.recordSimple(
      "audit:soap.amend",
      "soap",
      existing.id,
      "amend",
      this.actorToAuditActor(actor),
      "warning",
      {
        examinationId,
        amendId,
        reason: input.reason,
        previousStatus: existing.status,
        previousSignedAt: existing.signedAt,
        previousSignedBy: existing.signedBy,
      },
    );

    return {
      soap: toSoapNote(updated),
      amend: amendRecord,
    };
  }

  // -------------------------------------------------------------------------
  // listAmends
  // -------------------------------------------------------------------------

  public async listAmends(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<SoapAmendRecordContract[]> {
    this.requireTenantScope(actor, tenantId);
    return this.amends.persistedByExam(tenantId, examinationId);
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
