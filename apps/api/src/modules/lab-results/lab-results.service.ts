/**
 * @file Lab result service.
 * @module apps/api/modules/lab-results/lab-results.service
 *
 * @description GOAL-092 (FAZ-9) laboratuvar sonucu iş kuralları.
 *
 * State machine:
 * - `draft` → `pending_review` → `approved` (finalize)
 * - `approved` → `amended` (yeni revision oluşur; eski kayıt
 *   `amended` işaretlenir)
 *
 * İş kuralları:
 * - `createLabResult`: lab order `processing` veya `completed`
 *   olmalı; cancelled order'a sonuç girilemez (422). Mevcut
 *   aktif sonuç varsa 409 VET-LABRES-0003. Snapshot
 *   (unit, referenceRange) order'dan alınır. Audit
 *   `audit:labresult.create`.
 * - `updateLabResult`: yalnızca `draft` durumda (409
 *   VET-LABRES-0002). Audit `audit:labresult.update`.
 * - `submitForReview` (draft → pending_review). Audit.
 * - `approveLabResult` (pending_review → approved). Finalize;
 *   sonradan değiştirilemez. Audit `audit:labresult.approve`.
 * - `amendLabResult` (approved → amended + yeni draft revision).
 *   Eski kayıt `amended` işaretlenir; yeni revision ile yeni
 *   sonuç oluşur. Audit `audit:labresult.amend`.
 * - `getLabResultDetail` / `listLabResultRevisions`: tenant-scoped.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Cross-tenant IDOR → null. Onaylanmış sonuç değiştirilemez.
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toLabResult,
  toLabResultRevision,
  type LabResultRecord,
} from "../../common/lab-results/lab-result.types.js";
import type {
  LabResult,
  LabResultAmendInput,
  LabResultApproveInput,
  LabResultCreateInput,
  LabResultListResponse,
  LabResultSubmitInput,
  LabResultUpdateInput,
} from "@vetniva/contracts";

import { LabResultsRepository } from "./lab-results.repository.js";
import { LabOrdersService } from "../lab-orders/lab-orders.service.js";

@Injectable()
export class LabResultsService {
  private readonly logger = new Logger(LabResultsService.name);

  public constructor(
    private readonly repo: LabResultsRepository,
    private readonly labOrders: LabOrdersService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createLabResult (draft)
  // -------------------------------------------------------------------------

  public async createLabResult(
    tenantId: string,
    labOrderId: string,
    input: LabResultCreateInput,
    actor: ActorContext,
  ): Promise<LabResult> {
    this.requireTenantScope(actor, tenantId);

    const order = await this.labOrders.getLabOrderDetail(
      tenantId,
      labOrderId,
      actor,
    );
    if (!order) {
      throw new DomainError({
        errorCode: "VET-LABRES-0001",
        message: "Sonuç girilecek laboratuvar isteği bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0001",
        details: { labOrderId },
      });
    }
    if (order.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-LABRES-0005",
        message: "İptal edilmiş laboratuvar isteğine sonuç girilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0005",
        details: { labOrderId },
      });
    }
    if (order.status !== "processing" && order.status !== "completed") {
      throw new DomainError({
        errorCode: "VET-LABRES-0004",
        message:
          "Sonuç yalnızca processing veya completed durumdaki istekler için girilebilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0004",
        details: {
          labOrderId,
          orderStatus: order.status,
        },
      });
    }

    const existing = this.repo.findActiveByOrder(tenantId, labOrderId);
    if (existing) {
      throw new DomainError({
        errorCode: "VET-LABRES-0003",
        message: "Bu istek için aktif bir sonuç zaten var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0003",
        details: {
          labOrderId,
          existingResultId: existing.id,
          revision: existing.revision,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: LabResultRecord = {
      id,
      tenantId,
      labOrderId,
      revision: 1,
      value: input.value,
      valueNumeric: input.valueNumeric ?? null,
      // Order snapshot'ı
      unit: order.unit,
      referenceRange: order.referenceRange,
      abnormalFlag: input.abnormalFlag ?? "normal",
      status: "draft",
      attachments: input.attachments ?? [],
      notes: input.notes ?? null,
      enteredBy: actor.actorId ?? "system",
      enteredAt: nowIso,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      amendsResultId: null,
      amendmentReason: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:labresult.create",
      "labresult",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        labOrderId,
        value: input.value,
        abnormalFlag: input.abnormalFlag ?? "normal",
        attachmentCount: input.attachments?.length ?? 0,
      },
    );

    return toLabResult(record);
  }

  // -------------------------------------------------------------------------
  // listLabResultRevisions
  // -------------------------------------------------------------------------

  public async listLabResultRevisions(
    tenantId: string,
    labOrderId: string,
    actor: ActorContext,
  ): Promise<LabResultListResponse> {
    this.requireTenantScope(actor, tenantId);
    const all = this.repo.listByOrder(tenantId, labOrderId);
    return {
      items: all.map(toLabResultRevision),
      total: all.length,
    };
  }

  // -------------------------------------------------------------------------
  // getLabResultDetail (aktif revision)
  // -------------------------------------------------------------------------

  public async getLabResultDetail(
    tenantId: string,
    labOrderId: string,
    actor: ActorContext,
  ): Promise<LabResult | null> {
    this.requireTenantScope(actor, tenantId);
    const active = this.repo.findActiveByOrder(tenantId, labOrderId);
    return active ? toLabResult(active) : null;
  }

  // -------------------------------------------------------------------------
  // updateLabResult (draft only)
  // -------------------------------------------------------------------------

  public async updateLabResult(
    tenantId: string,
    labOrderId: string,
    input: LabResultUpdateInput,
    actor: ActorContext,
  ): Promise<LabResult> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireDraftResult(tenantId, labOrderId);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, existing.id, {
      value: input.value,
      valueNumeric: input.valueNumeric,
      abnormalFlag: input.abnormalFlag,
      attachments: input.attachments,
      notes: input.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:labresult.update",
      "labresult",
      existing.id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        labOrderId,
        fieldsChanged: Object.keys(input),
      },
    );

    return this.fetchUpdated(tenantId, existing.id);
  }

  // -------------------------------------------------------------------------
  // submitForReview (draft → pending_review)
  // -------------------------------------------------------------------------

  public async submitForReview(
    tenantId: string,
    labOrderId: string,
    input: LabResultSubmitInput,
    actor: ActorContext,
  ): Promise<LabResult> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireResult(tenantId, labOrderId);
    this.requireStateTransition(existing.status, "pending_review", [
      "draft",
    ]);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, existing.id, {
      status: "pending_review",
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:labresult.submit",
      "labresult",
      existing.id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        labOrderId,
      },
    );

    return this.fetchUpdated(tenantId, existing.id);
  }

  // -------------------------------------------------------------------------
  // approveLabResult (pending_review → approved)
  // -------------------------------------------------------------------------

  public async approveLabResult(
    tenantId: string,
    labOrderId: string,
    input: LabResultApproveInput,
    actor: ActorContext,
  ): Promise<LabResult> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireResult(tenantId, labOrderId);
    this.requireStateTransition(existing.status, "approved", [
      "pending_review",
    ]);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, existing.id, {
      status: "approved",
      reviewedBy: actor.actorId ?? "system",
      reviewedAt: nowIso,
      reviewNotes: input.reviewNotes ?? null,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:labresult.approve",
      "labresult",
      existing.id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      {
        labOrderId,
        revision: existing.revision,
        reviewNotes: input.reviewNotes ?? null,
      },
    );

    return this.fetchUpdated(tenantId, existing.id);
  }

  // -------------------------------------------------------------------------
  // amendLabResult (approved → amended + yeni draft revision)
  // -------------------------------------------------------------------------

  public async amendLabResult(
    tenantId: string,
    labOrderId: string,
    input: LabResultAmendInput,
    actor: ActorContext,
  ): Promise<LabResult> {
    this.requireTenantScope(actor, tenantId);
    const original = this.requireResult(tenantId, labOrderId);
    if (original.status !== "approved") {
      throw new DomainError({
        errorCode: "VET-LABRES-0002",
        message: "Yalnızca onaylanmış sonuçlar amendment ile düzeltilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0002",
        details: {
          labOrderId,
          currentStatus: original.status,
        },
      });
    }

    const nowIso = new Date().toISOString();
    // Orijinali amended işaretle.
    this.repo.update(tenantId, original.id, {
      status: "amended",
      updatedAt: nowIso,
    });

    // Yeni revision oluştur.
    const newId = this.repo.nextId(tenantId);
    const newRevision = this.repo.nextRevision(tenantId, labOrderId);
    const amendment: LabResultRecord = {
      id: newId,
      tenantId,
      labOrderId,
      revision: newRevision,
      value: input.value,
      valueNumeric: input.valueNumeric ?? null,
      unit: original.unit,
      referenceRange: original.referenceRange,
      abnormalFlag: input.abnormalFlag ?? "normal",
      status: "draft",
      attachments: input.attachments ?? [],
      notes: input.notes ?? null,
      enteredBy: actor.actorId ?? "system",
      enteredAt: nowIso,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      amendsResultId: original.id,
      amendmentReason: input.reason,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.repo.insert(amendment);

    await this.audit.recordSimple(
      "audit:labresult.amend",
      "labresult",
      newId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        labOrderId,
        amendsResultId: original.id,
        newRevision,
        reason: input.reason,
      },
    );

    return toLabResult(amendment);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireResult(
    tenantId: string,
    labOrderId: string,
  ): LabResultRecord {
    const rec = this.repo.findActiveByOrder(tenantId, labOrderId);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-LABRES-0001",
        message: "Sonuç bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0001",
        details: { labOrderId },
      });
    }
    return rec;
  }

  private requireDraftResult(
    tenantId: string,
    labOrderId: string,
  ): LabResultRecord {
    const rec = this.requireResult(tenantId, labOrderId);
    if (rec.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-LABRES-0002",
        message: "Yalnızca taslak (draft) sonuç güncellenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0002",
        details: { labOrderId, currentStatus: rec.status },
      });
    }
    return rec;
  }

  private requireStateTransition(
    current: "draft" | "pending_review" | "approved" | "amended",
    target: "draft" | "pending_review" | "approved" | "amended",
    allowedFrom: ("draft" | "pending_review" | "approved" | "amended")[],
  ): void {
    if (allowedFrom.includes(current)) return;
    throw new DomainError({
      errorCode: "VET-LABRES-0002",
      message: `Geçersiz durum geçişi: ${current} → ${target}`,
      httpStatus: 409,
      severity: "warning",
      i18nKey: "error.VET-LABRES-0002",
      details: { current, target, allowedFrom },
    });
  }

  private fetchUpdated(tenantId: string, id: string): LabResult {
    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-LABRES-0001",
        message: "Sonuç bulunamadı",
        httpStatus: 404,
      });
    }
    return toLabResult(updated);
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
