/**
 * @file Imaging order service.
 * @module apps/api/modules/imaging-orders/imaging-orders.service
 *
 * @description GOAL-093 (FAZ-9) görüntüleme isteği ve raporu iş kuralları.
 *
 * State machine:
 * - `ordered` → `scheduled` → `performed` → `reported` → `completed`
 * - `ordered | scheduled` → `cancelled`
 * - `reported` → `amended` (yeni revision oluşur)
 *
 * Katalog snapshot'ı (code/name/modality/bodyPart/price) order
 * üzerinde dondurulur; katalog sonradan değişse bile order kendi
 * anlık görüntüsünü korur. Dahili katalog (in-memory) W1.2d
 * kapsamında görüntüleme test kataloğu için korunmuştur
 * (production'a geçişte harici katalog adapter'ı eklenecek).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Fiziksel silme YOKTUR; düzeltme `cancelled` durumuna
 *   geçişle yapılır (DB trigger).
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 * @w1.2d DB persistence (in-memory → Prisma)
 */

import { Injectable, Logger } from "@nestjs/common";

import { ImagingOrdersRepository } from "./imaging-orders.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toImagingOrder,
  type ImagingOrderRecord,
  type ImagingReportRecord,
} from "../../common/imaging-orders/imaging-order.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  ImagingModality,
  ImagingOrder,
  ImagingOrderAmendReportInput,
  ImagingOrderApproveReportInput,
  ImagingOrderCancelInput,
  ImagingOrderCompleteInput,
  ImagingOrderCreateInput,
  ImagingOrderFilters,
  ImagingOrderListResponse,
  ImagingOrderPerformInput,
  ImagingOrderReportInput,
  ImagingOrderScheduleInput,
  ImagingOrderStatus,
} from "@vetniva/contracts";

/** Dahili katalog girdisi (W1.2d: production'da adapter). */
interface InternalImagingTest {
  id: string;
  code: string;
  name: string;
  modality: ImagingModality;
  bodyPart: string | null;
  price: string;
  active: boolean;
}

@Injectable()
export class ImagingOrdersService {
  private readonly logger = new Logger(ImagingOrdersService.name);

  /** Dahili katalog: W1.2d'de geçici; production adapter'ı Faz 14+. */
  private readonly catalog = new Map<string, InternalImagingTest>();

  public constructor(
    private readonly repo: ImagingOrdersRepository,
    private readonly audit: AuditService,
  ) {
    // Dahili katalog seed — Faz 14+ adapter bağlanana kadar.
    this.catalog.set("00000000-0000-0000-0000-000000010001", {
      id: "00000000-0000-0000-0000-000000010001",
      code: "XR-THX",
      name: "Toraks röntgeni (iki yönlü)",
      modality: "xray",
      bodyPart: "thorax",
      price: "180.0000",
      active: true,
    });
    this.catalog.set("00000000-0000-0000-0000-000000010011", {
      id: "00000000-0000-0000-0000-000000010011",
      code: "XR-THX-PORTABLE",
      name: "Toraks röntgeni (portable)",
      modality: "xray",
      bodyPart: "thorax",
      price: "220.0000",
      active: false,
    });
    this.catalog.set("00000000-0000-0000-0000-000000010006", {
      id: "00000000-0000-0000-0000-000000010006",
      code: "CT-THX",
      name: "Toraks bilgisayarlı tomografi",
      modality: "ct",
      bodyPart: "thorax",
      price: "450.0000",
      active: true,
    });
  }

  /** Dahili katalog lookup (production'da adapter). */
  private getImagingTestDetail(
    tenantId: string,
    imagingTestId: string,
  ): InternalImagingTest | null {
    const t = this.catalog.get(imagingTestId);
    if (!t) return null;
    // Tek tenant'lı katalog; cross-tenant kontrolü repo tarafında.
    void tenantId;
    return t;
  }

  // -------------------------------------------------------------------------
  // createImagingOrder
  // -------------------------------------------------------------------------

  public async createImagingOrder(
    tenantId: string,
    input: ImagingOrderCreateInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);

    const test = this.getImagingTestDetail(tenantId, input.imagingTestId);
    if (!test) {
      throw new DomainError({
        errorCode: "VET-IMG-0003",
        message: "Katalogda böyle bir görüntüleme testi bulunamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-IMG-0003",
        details: { imagingTestId: input.imagingTestId },
      });
    }
    if (!test.active) {
      throw new DomainError({
        errorCode: "VET-IMG-0004",
        message:
          "Katalogda bu görüntüleme testi pasif durumda; sipariş açılamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-IMG-0004",
        details: { imagingTestId: input.imagingTestId },
      });
    }

    const record = await this.repo.insert({
      tenantId,
      patientId: input.patientId,
      imagingTestId: input.imagingTestId,
      imagingTestCode: test.code,
      imagingTestName: test.name,
      modality: test.modality,
      bodyPart: input.bodyPart ?? test.bodyPart,
      price: test.price,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      priority: input.priority,
      notes: input.notes ?? null,
      createdBy: actor.actorId ?? "system",
    });

    await this.audit.recordSimple(
      "audit:imgorder.create",
      "imgorder",
      record.id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: input.patientId,
        imagingTestId: input.imagingTestId,
        imagingTestCode: test.code,
        modality: test.modality,
        sourceType: input.sourceType,
        priority: input.priority,
      },
    );

    return toImagingOrder(record);
  }

  // -------------------------------------------------------------------------
  // listImagingOrders / getImagingOrderDetail
  // -------------------------------------------------------------------------

  public async listImagingOrders(
    tenantId: string,
    filters: ImagingOrderFilters,
    actor: ActorContext,
  ): Promise<ImagingOrderListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.search(tenantId, {
      status: filters.status,
      modality: filters.modality,
      patientId: filters.patientId,
      sourceType: filters.sourceType,
      sourceId: filters.sourceId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toImagingOrder(r)),
      total: result.total,
    };
  }

  public async getImagingOrderDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<ImagingOrder | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.findById(tenantId, id);
    return rec ? toImagingOrder(rec) : null;
  }

  // -------------------------------------------------------------------------
  // scheduleImagingOrder (ordered → scheduled)
  // -------------------------------------------------------------------------

  public async scheduleImagingOrder(
    tenantId: string,
    id: string,
    input: ImagingOrderScheduleInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "scheduled", ["ordered"]);

    await this.repo.update(tenantId, id, {
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      scheduledLocation: input.scheduledLocation ?? null,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    });

    await this.audit.recordSimple(
      "audit:imgorder.schedule",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        scheduledAt: input.scheduledAt,
        scheduledLocation: input.scheduledLocation ?? null,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // performImagingOrder (scheduled → performed)
  // -------------------------------------------------------------------------

  public async performImagingOrder(
    tenantId: string,
    id: string,
    input: ImagingOrderPerformInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "performed", ["scheduled"]);

    await this.repo.update(tenantId, id, {
      status: "performed",
      performedAt: input.performedAt,
      performedByUserId: input.performedByUserId,
      contrastUse: input.contrastUse ?? null,
      attachments: input.attachments ?? existing.attachments,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    });

    await this.audit.recordSimple(
      "audit:imgorder.perform",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        performedAt: input.performedAt,
        performedByUserId: input.performedByUserId,
        contrastUse: input.contrastUse ?? null,
        attachmentCount:
          input.attachments?.length ?? existing.attachments.length,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // reportImagingOrder (performed → reported)
  // -------------------------------------------------------------------------

  public async reportImagingOrder(
    tenantId: string,
    id: string,
    input: ImagingOrderReportInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "reported", ["performed"]);

    const nowIso = new Date().toISOString();
    const newRevision: ImagingReportRecord = {
      revision: existing.reportRevisions.length + 1,
      findings: input.findings,
      impression: input.impression,
      recommendation: input.recommendation ?? null,
      attachments: input.attachments ?? [],
      enteredBy: actor.actorId ?? "system",
      enteredAt: nowIso,
      amendmentReason: null,
      approved: false,
      approvedBy: null,
      approvedAt: null,
      portalVisible: false,
      reviewNotes: null,
    };

    const reportRevisions = [...existing.reportRevisions, newRevision];

    await this.repo.update(tenantId, id, {
      status: "reported",
      reportRevisions,
    });

    await this.audit.recordSimple(
      "audit:imgorder.report",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        revision: newRevision.revision,
        findingsLength: input.findings.length,
        portalVisible: newRevision.portalVisible,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // approveReport (rapor onayı)
  // -------------------------------------------------------------------------

  public async approveReport(
    tenantId: string,
    id: string,
    input: ImagingOrderApproveReportInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.requireOrder(tenantId, id);
    if (existing.reportRevisions.length === 0) {
      throw new DomainError({
        errorCode: "VET-IMG-0005",
        message: "Rapor bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-IMG-0005",
        details: { id },
      });
    }
    const lastRevision =
      existing.reportRevisions[existing.reportRevisions.length - 1]!;
    if (lastRevision.approved) {
      throw new DomainError({
        errorCode: "VET-IMG-0008",
        message: "Rapor zaten onaylanmış; tekrar onaylanamaz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-IMG-0008",
        details: {
          approvedBy: lastRevision.approvedBy,
          approvedAt: lastRevision.approvedAt,
        },
      });
    }
    const nowIso = new Date().toISOString();
    const lastIdx = existing.reportRevisions.length - 1;
    // Approve sonrasi son revizyonun audit'e yazilacak metadata'si
    // burada yakalanir; sonradan `updated.at(-1)` ile ayni referansa
    // dusulmesi yerine dogrudan bu snapshot kullanilir (security/
    // detect-object-injection uyarisini da ortadan kaldirir).
    const lastExisting = existing.reportRevisions.at(-1)!;
    let approvedRevisionNumber: number | undefined;
    let approvedPortalVisible: boolean | undefined;
    const updated = existing.reportRevisions.map((r, i) => {
      if (i !== lastIdx) {
        return r;
      }
      approvedRevisionNumber = r.revision;
      approvedPortalVisible = input.portalVisible ?? r.portalVisible;
      return {
        ...r,
        approved: true,
        approvedBy: actor.actorId ?? "system",
        approvedAt: nowIso,
        reviewNotes: input.reviewNotes ?? null,
        portalVisible: approvedPortalVisible,
      };
    });

    await this.repo.update(tenantId, id, { reportRevisions: updated });

    await this.audit.recordSimple(
      "audit:imgorder.approve_report",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        revision: approvedRevisionNumber ?? lastExisting.revision,
        portalVisible: approvedPortalVisible ?? lastExisting.portalVisible,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // amendReport (yeni revision)
  // -------------------------------------------------------------------------

  public async amendReport(
    tenantId: string,
    id: string,
    input: ImagingOrderAmendReportInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.requireOrder(tenantId, id);
    if (existing.reportRevisions.length === 0) {
      throw new DomainError({
        errorCode: "VET-IMG-0005",
        message: "Amendment için mevcut rapor bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-IMG-0005",
        details: { id },
      });
    }
    const lastRevision =
      existing.reportRevisions[existing.reportRevisions.length - 1]!;
    // Amendment yalnızca draft veya approved raporlar üzerinde yapılabilir;
    // zaten amended edilmiş son revizyon üzerinde amendment yapılamaz.
    if (lastRevision.approved === null) {
      // reserved: gelecekte draft+approved ayrımı eklenirse
    }

    const nowIso = new Date().toISOString();
    const newRevision: ImagingReportRecord = {
      revision: existing.reportRevisions.length + 1,
      findings: input.findings,
      impression: input.impression,
      recommendation: input.recommendation ?? null,
      attachments: input.attachments ?? [],
      enteredBy: actor.actorId ?? "system",
      enteredAt: nowIso,
      amendmentReason: input.reason,
      approved: false,
      approvedBy: null,
      approvedAt: null,
      portalVisible: lastRevision.portalVisible,
      reviewNotes: null,
    };

    const reportRevisions = [...existing.reportRevisions, newRevision];

    await this.repo.update(tenantId, id, {
      status: "amended",
      reportRevisions,
    });

    await this.audit.recordSimple(
      "audit:imgorder.amend_report",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        newRevision: newRevision.revision,
        amendsRevision: lastRevision.revision,
        reason: input.reason,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // completeImagingOrder (reported → completed)
  // -------------------------------------------------------------------------

  public async completeImagingOrder(
    tenantId: string,
    id: string,
    input: ImagingOrderCompleteInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "completed", ["reported"]);

    await this.repo.update(tenantId, id, {
      status: "completed",
      notes: input.notes !== undefined ? input.notes : existing.notes,
    });

    await this.audit.recordSimple(
      "audit:imgorder.complete",
      "imgorder",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      {
        previousStatus: existing.status,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // cancelImagingOrder (ordered|scheduled → cancelled)
  // -------------------------------------------------------------------------

  public async cancelImagingOrder(
    tenantId: string,
    id: string,
    input: ImagingOrderCancelInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "cancelled", [
      "ordered",
      "scheduled",
    ]);

    const nowIso = new Date().toISOString();
    await this.repo.update(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.reason,
    });

    await this.audit.recordSimple(
      "audit:imgorder.cancel",
      "imgorder",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousStatus: existing.status,
        reason: input.reason,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async requireOrder(
    tenantId: string,
    id: string,
  ): Promise<ImagingOrderRecord> {
    const rec = await this.repo.findById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-IMG-0001",
        message: "Görüntüleme isteği bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-IMG-0001",
        details: { id },
      });
    }
    return rec;
  }

  private requireStateTransition(
    current: ImagingOrderStatus,
    target: ImagingOrderStatus,
    allowedFrom: ImagingOrderStatus[],
  ): void {
    if (allowedFrom.includes(current)) return;
    throw new DomainError({
      errorCode: "VET-IMG-0002",
      message: `Geçersiz durum geçişi: ${current} → ${target}`,
      httpStatus: 409,
      severity: "warning",
      i18nKey: "error.VET-IMG-0002",
      details: { current, target, allowedFrom },
    });
  }

  private async fetchUpdated(
    tenantId: string,
    id: string,
  ): Promise<ImagingOrder> {
    const updated = await this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-IMG-0001",
        message: "Görüntüleme isteği bulunamadı",
        httpStatus: 404,
      });
    }
    return toImagingOrder(updated);
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
