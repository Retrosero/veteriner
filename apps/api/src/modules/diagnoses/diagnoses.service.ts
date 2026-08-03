/**
 * @file Diagnosis (teşhis) service.
 * @module apps/api/modules/diagnoses/diagnoses.service
 * @description GOAL-043 teşhis ve problem listesi iş kuralları.
 * ExaminationsService (GOAL-040) ile entegre: yeni teşhis
 * eklenirken examination aynı tenant'ta mı doğrulanır (cross-tenant
 * → 404 VET-CLINIC-0001).
 *
 * İş kuralları:
 * - `add`: Examination aynı tenant'ta mı (cross-tenant → 404);
 *   status='active', category input'tan. Audit `audit:diagnosis.create`
 *   (info).
 * - `listForExamination`: examination-scoped, arşivlenmemiş.
 * - `listForPatient`: tüm muayenelerden, opsiyonel status filtresi.
 * - `resolve`: status='active' → 'resolved', resolvedAt set.
 *   Audit `audit:diagnosis.resolve` (info).
 * - `setChronic`: status='active' → 'chronic'. Audit
 *   `audit:diagnosis.chronic` (info).
 * - `setRuledOut`: status='active' (kategori differential dahil) → 'ruled_out'.
 *   Audit `audit:diagnosis.ruled_out` (info).
 * - `remove`: soft delete (archivedAt set). Audit
 *   `audit:diagnosis.archive` (warning).
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import { Injectable, Logger } from "@nestjs/common";

import { DiagnosesRepository } from "./diagnoses.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import {
  type DiagnosisRecord,
  toDiagnosis,
} from "../../common/diagnoses/diagnosis.types.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ExaminationsService } from "../examinations/examinations.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Diagnosis,
  DiagnosisCreateInput,
  DiagnosisPatientListFilters,
} from "@vetniva/contracts";

@Injectable()
export class DiagnosesService {
  private readonly logger = new Logger(DiagnosesService.name);

  public constructor(
    private readonly repo: DiagnosesRepository,
    private readonly examinations: ExaminationsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // add
  // -------------------------------------------------------------------------

  public async add(
    tenantId: string,
    input: DiagnosisCreateInput,
    actor: ActorContext,
  ): Promise<Diagnosis> {
    this.requireTenantScope(actor, tenantId);

    // 1) Examination aynı tenant'ta mı (cross-tenant → 404).
    const exam = await this.examinations.findById(
      tenantId,
      input.examinationId,
      actor,
    );
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId: input.examinationId },
      });
    }

    // 2) Repository'ye ekle.
    const id = this.repo.nextId(tenantId);
    const now = new Date().toISOString();
    const record: DiagnosisRecord = this.repo.toRecord({
      id,
      tenantId,
      examinationId: exam.id,
      patientId: exam.patientId,
      code: input.code ?? null,
      name: input.name,
      category: input.category,
      status: "active",
      notes: input.notes ?? null,
      createdAt: now,
      createdBy: actor.actorId ?? "system",
      resolvedAt: null,
      archivedAt: null,
    });
    await this.repo.persist(record);

    // 3) Audit.
    await this.audit.recordSimple(
      "audit:diagnosis.create",
      "diagnosis",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId: record.examinationId,
        patientId: record.patientId,
        category: record.category,
        status: record.status,
        code: record.code,
      },
    );

    return toDiagnosis(record);
  }

  // -------------------------------------------------------------------------
  // listForExamination
  // -------------------------------------------------------------------------

  public async listForExamination(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<Diagnosis[]> {
    this.requireTenantScope(actor, tenantId);
    const recs = await this.repo.persistedByExam(tenantId, examinationId);
    return recs.map((r) => toDiagnosis(r));
  }

  // -------------------------------------------------------------------------
  // listForPatient
  // -------------------------------------------------------------------------

  public async listForPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
    filters: DiagnosisPatientListFilters = { includeArchived: false },
  ): Promise<Diagnosis[]> {
    this.requireTenantScope(actor, tenantId);
    const recs = await this.repo.persistedByPatient(tenantId, patientId, {
      status: filters.status,
      includeArchived: filters.includeArchived,
    });
    return recs.map((r) => toDiagnosis(r));
  }

  // -------------------------------------------------------------------------
  // resolve
  // -------------------------------------------------------------------------

  public async resolve(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Diagnosis> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedId(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-DIAG-0001",
        message: "Yalnızca aktif teşhis çözümlenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DIAG-0001",
        details: { id, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    const updated = await this.repo.persistedUpdate(tenantId, id, {
      status: "resolved",
      resolvedAt: now,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:diagnosis.resolve",
      "diagnosis",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: { status: existing.status, resolvedAt: existing.resolvedAt },
        after: { status: updated.status, resolvedAt: updated.resolvedAt },
      },
    );

    return toDiagnosis(updated);
  }

  // -------------------------------------------------------------------------
  // setChronic
  // -------------------------------------------------------------------------

  public async setChronic(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Diagnosis> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedId(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-DIAG-0001",
        message: "Yalnızca aktif teşhis kronik yapılabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DIAG-0001",
        details: { id, status: existing.status },
      });
    }

    const updated = await this.repo.persistedUpdate(tenantId, id, {
      status: "chronic",
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:diagnosis.chronic",
      "diagnosis",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: { status: existing.status },
        after: { status: updated.status },
      },
    );

    return toDiagnosis(updated);
  }

  // -------------------------------------------------------------------------
  // setRuledOut
  // -------------------------------------------------------------------------

  public async setRuledOut(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Diagnosis> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedId(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-DIAG-0001",
        message: "Yalnızca aktif teşhis elenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DIAG-0001",
        details: { id, status: existing.status },
      });
    }

    const updated = await this.repo.persistedUpdate(tenantId, id, {
      status: "ruled_out",
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:diagnosis.ruled_out",
      "diagnosis",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: { status: existing.status },
        after: { status: updated.status },
      },
    );

    return toDiagnosis(updated);
  }

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  public async remove(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedId(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      // Zaten arşivlenmiş → idempotent no-op, ek audit yazma.
      return;
    }

    const now = new Date().toISOString();
    const updated = await this.repo.persistedUpdate(tenantId, id, {
      archivedAt: now,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Teşhis bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:diagnosis.archive",
      "diagnosis",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        before: { archivedAt: existing.archivedAt },
        after: { archivedAt: updated.archivedAt },
        examinationId: existing.examinationId,
        patientId: existing.patientId,
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
