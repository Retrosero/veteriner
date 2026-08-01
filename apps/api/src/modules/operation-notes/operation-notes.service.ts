/**
 * @file OperationNote service.
 * @module apps/api/modules/operation-notes/operation-notes.service
 *
 * @description GOAL-083 (FAZ-8) ameliyat operasyon notu iş
 * kuralları. Bir ameliyat planına (surgeryPlanId) bağlı tek bir
 * operasyon notu; ekip + kullanılan malzeme append-only olarak
 * tutulur. Finalize edildiğinde her material için bir
 * `clinical_use` stock movement oluşturulur (cross-module
 * StockMovementsService).
 *
 * İş kuralları:
 * - `createOperationNote`:
 *   - `surgeryPlanId` mevcut ve `in_progress` durumda olmalı
 *     (422 VET-OPNOTE-0003).
 *   - `patientId` plan ile aynı olmalı (422 VET-OPNOTE-0003).
 *   - Aynı plan için mevcut operation note reddedilir
 *     (409 VET-OPNOTE-0004).
 *   - Audit `audit:operation_note.create`.
 * - `updateOperationNote`: yalnızca `draft` durumda
 *   (409 VET-OPNOTE-0002). Audit.
 * - `addTeamMember` / `addMaterial`: yalnızca `draft` durumda
 *   (409 VET-OPNOTE-0002). Audit.
 * - `finalizeOperationNote`: draft → finalized. finalizedAt +
 *   finalizedBy set. Her material için StockMovementsService
 *   üzerinden `clinical_use` hareketi oluşturulur. Sonra
 *   malzeme append-only kilitlenir. Audit.
 * - `amendOperationNote`: finalized → amended (yeni revision).
 *   Eski sürüm korunur; yeni operation note oluşturulur ve
 *   `amendsNoteId` ile bağlanır. Audit.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Operasyon notu üzerinde fiziksel silme YOKTUR; düzeltme
 *   amendment ile yapılır.
 *
 * @since GOAL-083 (FAZ-8) operasyon notu ve kullanılan malzemeler core
 */

import { Injectable, Logger } from "@nestjs/common";

import { OperationNotesRepository } from "./operation-notes.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toOperationNote,
  toOperationNoteMaterial,
  toOperationNoteTeam,
  type OperationNoteDetail,
  type OperationNoteMaterialRecord,
  type OperationNoteRecord,
  type OperationNoteTeamRecord,
} from "../../common/operation-notes/operation-note.types.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";
import { SurgeryPlansService } from "../surgery-plans/surgery-plans.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  OperationNote,
  OperationNoteAmendInput,
  OperationNoteCreateInput,
  OperationNoteFilters,
  OperationNoteFinalizeInput,
  OperationNoteListResponse,
  OperationNoteMaterial,
  OperationNoteMaterialInput,
  OperationNoteTeam,
  OperationNoteTeamInput,
  OperationNoteUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class OperationNotesService {
  private readonly logger = new Logger(OperationNotesService.name);

  public constructor(
    private readonly repo: OperationNotesRepository,
    private readonly surgeryPlans: SurgeryPlansService,
    private readonly stockMovements: StockMovementsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createOperationNote
  // -------------------------------------------------------------------------

  public async createOperationNote(
    tenantId: string,
    input: OperationNoteCreateInput,
    actor: ActorContext,
  ): Promise<OperationNote> {
    this.requireTenantScope(actor, tenantId);

    // Plan in_progress olmalı.
    const plan = await this.surgeryPlans.getPlanDetail(
      tenantId,
      input.surgeryPlanId,
      actor,
    );
    if (!plan) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0003",
        message:
          "Operasyon notu yalnızca mevcut bir ameliyat planı için açılabilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0003",
        details: { surgeryPlanId: input.surgeryPlanId },
      });
    }
    if (plan.status !== "in_progress") {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0003",
        message:
          "Operasyon notu yalnızca devam eden (in_progress) ameliyat için açılabilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0003",
        details: {
          surgeryPlanId: input.surgeryPlanId,
          planStatus: plan.status,
        },
      });
    }
    if (plan.patientId !== input.patientId) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0003",
        message: "patientId ameliyat planı ile aynı olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0003",
        details: {
          surgeryPlanId: input.surgeryPlanId,
          planPatientId: plan.patientId,
          inputPatientId: input.patientId,
        },
      });
    }

    // Aynı plan için mevcut note reddedilir.
    const existing = this.repo.findBySurgeryPlanId(
      tenantId,
      input.surgeryPlanId,
    );
    if (existing) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0004",
        message: "Bu ameliyat planı için zaten bir operasyon notu var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0004",
        details: {
          surgeryPlanId: input.surgeryPlanId,
          existingNoteId: existing.id,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: OperationNoteRecord = {
      id,
      tenantId,
      surgeryPlanId: input.surgeryPlanId,
      patientId: input.patientId,
      status: "draft",
      procedure: input.procedure,
      findings: input.findings ?? null,
      complicationsText: input.complicationsText ?? null,
      technique: input.technique ?? null,
      closureNotes: input.closureNotes ?? null,
      estimatedBloodLoss: input.estimatedBloodLoss ?? null,
      finalizedAt: null,
      finalizedBy: null,
      amendsNoteId: null,
      amendmentReason: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:operation_note.create",
      "operation_note",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        surgeryPlanId: input.surgeryPlanId,
        patientId: input.patientId,
        procedure: input.procedure,
      },
    );

    return toOperationNote(record);
  }

  // -------------------------------------------------------------------------
  // listOperationNotes
  // -------------------------------------------------------------------------

  public async listOperationNotes(
    tenantId: string,
    filters: OperationNoteFilters,
    actor: ActorContext,
  ): Promise<OperationNoteListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      status: filters.status,
      patientId: filters.patientId,
      surgeryPlanId: filters.surgeryPlanId,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toOperationNote(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getOperationNoteDetail
  // -------------------------------------------------------------------------

  public async getOperationNoteDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<OperationNoteDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    if (!rec) return null;
    return {
      operationNote: toOperationNote(rec),
      team: this.repo.listTeam(tenantId, id).map(toOperationNoteTeam),
      materials: this.repo
        .listMaterials(tenantId, id)
        .map(toOperationNoteMaterial),
    };
  }

  // -------------------------------------------------------------------------
  // updateOperationNote
  // -------------------------------------------------------------------------

  public async updateOperationNote(
    tenantId: string,
    id: string,
    input: OperationNoteUpdateInput,
    actor: ActorContext,
  ): Promise<OperationNote> {
    this.requireTenantScope(actor, tenantId);
    this.requireDraftNote(tenantId, id, "güncelleme");
    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      procedure: input.procedure,
      findings: input.findings,
      complicationsText: input.complicationsText,
      technique: input.technique,
      closureNotes: input.closureNotes,
      estimatedBloodLoss: input.estimatedBloodLoss,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:operation_note.update",
      "operation_note",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { fieldsChanged: Object.keys(input) },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0001",
        message: "Operasyon notu bulunamadı",
        httpStatus: 404,
      });
    }
    return toOperationNote(updated);
  }

  // -------------------------------------------------------------------------
  // addTeamMember
  // -------------------------------------------------------------------------

  public async addTeamMember(
    tenantId: string,
    id: string,
    input: OperationNoteTeamInput,
    actor: ActorContext,
  ): Promise<OperationNoteTeam> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireDraftNote(tenantId, id, "ekip üyesi");
    const nowIso = new Date().toISOString();
    const subId = this.repo.nextSubId(tenantId, "opt");
    const rec: OperationNoteTeamRecord = {
      id: subId,
      tenantId,
      operationNoteId: existing.id,
      userId: input.userId,
      role: input.role,
      assignedAt: input.assignedAt,
      endedAt: input.endedAt ?? null,
      notes: input.notes ?? null,
      createdAt: nowIso,
    };
    this.repo.insertTeam(rec);
    this.repo.update(tenantId, id, { updatedAt: nowIso });

    await this.audit.recordSimple(
      "audit:operation_note.team_add",
      "operation_note",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        teamId: subId,
        userId: input.userId,
        role: input.role,
      },
    );

    return toOperationNoteTeam(rec);
  }

  // -------------------------------------------------------------------------
  // addMaterial
  // -------------------------------------------------------------------------

  public async addMaterial(
    tenantId: string,
    id: string,
    input: OperationNoteMaterialInput,
    actor: ActorContext,
  ): Promise<OperationNoteMaterial> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireDraftNote(tenantId, id, "malzeme");
    const nowIso = new Date().toISOString();
    const subId = this.repo.nextSubId(tenantId, "opm");
    const rec: OperationNoteMaterialRecord = {
      id: subId,
      tenantId,
      operationNoteId: existing.id,
      productId: input.productId,
      quantity: input.quantity,
      unit: input.unit,
      usedAt: input.usedAt,
      usedByUserId: input.usedByUserId,
      lotId: input.lotId ?? null,
      notes: input.notes ?? null,
      stockMovementId: null,
      createdAt: nowIso,
    };
    this.repo.insertMaterial(rec);
    this.repo.update(tenantId, id, { updatedAt: nowIso });

    await this.audit.recordSimple(
      "audit:operation_note.material_add",
      "operation_note",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        materialId: subId,
        productId: input.productId,
        quantity: input.quantity,
        unit: input.unit,
      },
    );

    return toOperationNoteMaterial(rec);
  }

  // -------------------------------------------------------------------------
  // finalizeOperationNote
  // -------------------------------------------------------------------------

  public async finalizeOperationNote(
    tenantId: string,
    id: string,
    input: OperationNoteFinalizeInput,
    actor: ActorContext,
  ): Promise<OperationNote> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0001",
        message: "Operasyon notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0001",
        details: { id },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0002",
        message: "Operasyon notu zaten finalize edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0002",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();

    // Finalize bilgilerini yaz (önce update).
    this.repo.update(tenantId, id, {
      status: "finalized",
      finalizedAt: nowIso,
      finalizedBy: actor.actorId ?? "system",
      findings:
        input.findings !== undefined ? input.findings : existing.findings,
      complicationsText:
        input.complicationsText !== undefined
          ? input.complicationsText
          : existing.complicationsText,
      technique:
        input.technique !== undefined ? input.technique : existing.technique,
      closureNotes:
        input.closureNotes !== undefined
          ? input.closureNotes
          : existing.closureNotes,
      estimatedBloodLoss:
        input.estimatedBloodLoss !== undefined
          ? input.estimatedBloodLoss
          : existing.estimatedBloodLoss,
      updatedAt: nowIso,
    });

    // Her material için stock movement oluştur.
    const materials = this.repo.listMaterials(tenantId, id);
    for (const mat of materials) {
      if (mat.stockMovementId) continue;
      const sm = await this.stockMovements.createSystemMovement(
        tenantId,
        {
          type: "clinical_use",
          productId: mat.productId,
          lotId: mat.lotId ?? undefined,
          quantity: `-${mat.quantity}`,
          occurredAt: mat.usedAt,
          notes: mat.notes ?? undefined,
        },
        actor,
        { systemSourceType: "operation_note", systemSourceId: id },
      );
      this.repo.updateMaterial(tenantId, mat.id, {
        stockMovementId: sm.id,
      });
    }

    await this.audit.recordSimple(
      "audit:operation_note.finalize",
      "operation_note",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      {
        surgeryPlanId: existing.surgeryPlanId,
        materialCount: materials.length,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0001",
        message: "Operasyon notu bulunamadı",
        httpStatus: 404,
      });
    }
    return toOperationNote(updated);
  }

  // -------------------------------------------------------------------------
  // amendOperationNote
  // -------------------------------------------------------------------------

  public async amendOperationNote(
    tenantId: string,
    id: string,
    input: OperationNoteAmendInput,
    actor: ActorContext,
  ): Promise<OperationNote> {
    this.requireTenantScope(actor, tenantId);
    const original = this.repo.findById(tenantId, id);
    if (!original) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0001",
        message: "Operasyon notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0001",
        details: { id },
      });
    }
    if (original.status !== "finalized") {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0005",
        message:
          "Yalnızca finalize edilmiş operasyon notları amendment ile düzeltilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0005",
        details: { id, currentStatus: original.status },
      });
    }

    const nowIso = new Date().toISOString();

    // Orijinali amended işaretle.
    this.repo.update(tenantId, id, {
      status: "amended",
      updatedAt: nowIso,
    });

    // Yeni revision oluştur (draft).
    const newId = this.repo.nextId(tenantId);
    const amendment: OperationNoteRecord = {
      id: newId,
      tenantId,
      surgeryPlanId: original.surgeryPlanId,
      patientId: original.patientId,
      status: "draft",
      procedure: original.procedure,
      findings: original.findings,
      complicationsText: original.complicationsText,
      technique: original.technique,
      closureNotes: original.closureNotes,
      estimatedBloodLoss: original.estimatedBloodLoss,
      finalizedAt: null,
      finalizedBy: null,
      amendsNoteId: original.id,
      amendmentReason: input.reason,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(amendment);

    await this.audit.recordSimple(
      "audit:operation_note.amend",
      "operation_note",
      newId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        amendsNoteId: id,
        reason: input.reason,
      },
    );

    return toOperationNote(amendment);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** draft durumda olmalı; değilse 409 VET-OPNOTE-0002. */
  private requireDraftNote(
    tenantId: string,
    id: string,
    subType: string,
  ): OperationNoteRecord {
    const rec = this.repo.findById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0001",
        message: "Operasyon notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0001",
        details: { id },
      });
    }
    if (rec.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0002",
        message: `Finalize edilmiş operasyon notuna ${subType} eklenemez`,
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0002",
        details: { id, currentStatus: rec.status },
      });
    }
    return rec;
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
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
