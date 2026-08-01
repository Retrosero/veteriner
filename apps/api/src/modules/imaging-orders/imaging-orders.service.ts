/**
 * @file Imaging order service.
 * @module apps/api/modules/imaging-orders/imaging-orders.service
 *
 * @description GOAL-093 (FAZ-9) görüntüleme isteği iş kuralları.
 *
 * State machine:
 * - `ordered` → `scheduled` → `performed` → `reported` → `completed`
 * - `ordered | scheduled` → `cancelled`
 * - `reported` → `amended` (yeni rapor revizyonu)
 *
 * İş kuralları:
 * - `createImagingOrder`: `imagingTestId` katalogdan çekilir; pasif
 *   katalog reddedilir (422 VET-IMG-0004). Katalog snapshot'ı
 *   (code, name, modality, bodyPart, price) order üzerinde
 *   dondurulur. Audit `audit:imgorder.create`.
 * - `scheduleImagingOrder` (ordered → scheduled): scheduledAt +
 *   scheduledLocation. Audit.
 * - `performImagingOrder` (scheduled → performed): performedAt +
 *   performedByUserId + contrastUse + attachments. Audit.
 * - `reportImagingOrder` (performed → reported): findings +
 *   impression + recommendation + attachments. Yeni revision
 *   1 ile başlar. Audit.
 * - `approveReport` (reported → reported/approved): approved +
 *   approvedBy/At + portalVisible. Onaylanmış rapor değiştirilemez.
 *   Audit.
 * - `amendReport` (reported/approved → reported, yeni revision):
 *   amendmentReason zorunlu. Onaylanmamış raporda düzeltme için
 *   de kullanılabilir (önceki revision `superseded` mantığıyla
 *   listelenmeye devam eder; status reported kalır).
 * - `completeImagingOrder` (reported → completed): completedAt set.
 * - `cancelImagingOrder` (ordered|scheduled → cancelled): reason
 *   zorunlu.
 * - `getImagingOrderDetail` / `listImagingOrders`: tenant-scoped.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Cross-tenant IDOR → null/404. Fiziksel silme YOKTUR; geri
 *   çekme `cancelled` durumuna geçişle yapılır. Onaylanmış rapor
 *   değiştirilemez; düzeltme `amend` ile yeni revision olarak
 *   yapılır. Portal görünürlüğü `portalVisible` ile ayrıca
 *   kontrol edilir.
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
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
  ImagingOrder,
  ImagingOrderCancelInput,
  ImagingOrderAmendReportInput,
  ImagingOrderApproveReportInput,
  ImagingOrderCompleteInput,
  ImagingOrderCreateInput,
  ImagingOrderFilters,
  ImagingOrderListResponse,
  ImagingOrderPerformInput,
  ImagingOrderReportInput,
  ImagingOrderScheduleInput,
  ImagingOrderStatus,
  ImagingModality,
} from "@vetniva/contracts";

/** Dahili görüntüleme kataloğu girdisi. */
interface InternalImagingTest {
  id: string;
  code: string;
  name: string;
  modality: ImagingModality;
  bodyPart: string | null;
  price: string;
  active: boolean;
}

/**
 * Varsayılan görüntüleme kataloğu. Tenant-bazlı genişletme
 * sonraki tick'te `imaging-tests` modülüne taşınacak.
 */
const DEFAULT_IMAGING_TESTS: InternalImagingTest[] = [
  {
    id: "00000000-0000-0000-0000-000000010001",
    code: "XR-THX",
    name: "Toraks röntgeni (iki yönlü)",
    modality: "xray",
    bodyPart: "thorax",
    price: "180.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010002",
    code: "XR-ABD",
    name: "Karın röntgeni",
    modality: "xray",
    bodyPart: "abdomen",
    price: "180.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010003",
    code: "XR-EXT",
    name: "Ekstremite röntgeni",
    modality: "xray",
    bodyPart: "limb",
    price: "150.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010004",
    code: "US-ABD",
    name: "Abdominal ultrason",
    modality: "ultrasound",
    bodyPart: "abdomen",
    price: "350.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010005",
    code: "US-CARD",
    name: "Kardiyak ultrason (ekokardiyografi)",
    modality: "ultrasound",
    bodyPart: "heart",
    price: "450.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010006",
    code: "CT-THX",
    name: "Toraks BT",
    modality: "ct",
    bodyPart: "thorax",
    price: "1200.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010007",
    code: "CT-ABD",
    name: "Abdominal BT",
    modality: "ct",
    bodyPart: "abdomen",
    price: "1400.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010008",
    code: "MRI-BRAIN",
    name: "Beyin MRG",
    modality: "mri",
    bodyPart: "brain",
    price: "2200.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010009",
    code: "MRI-SPINE",
    name: "Omurga MRG",
    modality: "mri",
    bodyPart: "spine",
    price: "2200.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010010",
    code: "ENDO-GI",
    name: "Gastroskopi",
    modality: "endoscopy",
    bodyPart: "stomach",
    price: "1800.0000",
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000010011",
    code: "XR-THX-PORTABLE",
    name: "Portabl toraks röntgeni",
    modality: "xray",
    bodyPart: "thorax",
    price: "250.0000",
    active: false,
  },
];

@Injectable()
export class ImagingOrdersService {
  private readonly logger = new Logger(ImagingOrdersService.name);
  /** Tenant-scoped görüntüleme kataloğu (şimdilik tenant farkı yok). */
  private readonly catalog = new Map<string, InternalImagingTest>();

  public constructor(
    private readonly repo: ImagingOrdersRepository,
    private readonly audit: AuditService,
  ) {
    for (const t of DEFAULT_IMAGING_TESTS) {
      this.catalog.set(t.id, t);
    }
  }

  // -------------------------------------------------------------------------
  // Katalog (yardımcı)
  // -------------------------------------------------------------------------

  /**
   * Görüntüleme kataloğu girdisini döner. Bulunamadı → null.
   * Şimdilik tüm tenant'lar aynı kataloğu paylaşır; tenant-scoped
   * katalog sonraki tick'lerde `imaging-tests` modülüne taşınacak.
   */
  public getImagingTestDetail(
    _tenantId: string,
    id: string,
  ): InternalImagingTest | null {
    return this.catalog.get(id) ?? null;
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

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: ImagingOrderRecord = {
      id,
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
      status: "ordered",
      scheduledAt: null,
      scheduledLocation: null,
      performedAt: null,
      performedByUserId: null,
      contrastUse: null,
      clinicalInfo: input.clinicalInfo ?? null,
      attachments: [],
      reportRevisions: [],
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:imgorder.create",
      "imgorder",
      id,
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
    const result = this.repo.search(tenantId, {
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
    const rec = this.repo.findById(tenantId, id);
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
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "scheduled", ["ordered"]);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      scheduledLocation: input.scheduledLocation ?? null,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
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
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "performed", ["scheduled"]);

    const nowIso = new Date().toISOString();
    const performedAt = input.performedAt ?? nowIso;
    this.repo.update(tenantId, id, {
      status: "performed",
      performedAt,
      performedByUserId: input.performedByUserId ?? null,
      contrastUse: input.contrastUse ?? "none",
      attachments: input.attachments ?? existing.attachments,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:imgorder.perform",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        performedAt,
        contrastUse: input.contrastUse ?? "none",
        attachmentCount: (input.attachments ?? existing.attachments).length,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // reportImagingOrder (performed → reported) — ilk rapor revision
  // -------------------------------------------------------------------------

  public async reportImagingOrder(
    tenantId: string,
    id: string,
    input: ImagingOrderReportInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "reported", ["performed"]);

    const nowIso = new Date().toISOString();
    const revision: ImagingReportRecord = {
      revision: 1,
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
    this.repo.update(tenantId, id, {
      status: "reported",
      reportRevisions: [...existing.reportRevisions, revision],
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:imgorder.report",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        revision: 1,
        attachmentCount: (input.attachments ?? []).length,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // approveReport (reported → reported, approved=true)
  // -------------------------------------------------------------------------

  public async approveReport(
    tenantId: string,
    id: string,
    input: ImagingOrderApproveReportInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireOrder(tenantId, id);
    if (existing.status !== "reported" && existing.status !== "amended") {
      throw new DomainError({
        errorCode: "VET-IMG-0006",
        message: `Rapor onayı için sipariş "reported" durumunda olmalı: ${existing.status}`,
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-IMG-0006",
      });
    }
    if (existing.reportRevisions.length === 0) {
      throw new DomainError({
        errorCode: "VET-IMG-0007",
        message: "Onaylanacak bir rapor bulunamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-IMG-0007",
      });
    }
    const last = existing.reportRevisions[existing.reportRevisions.length - 1]!;
    if (last.approved) {
      throw new DomainError({
        errorCode: "VET-IMG-0008",
        message: "Son rapor zaten onaylanmış; düzeltme için amend kullanın",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-IMG-0008",
      });
    }

    const nowIso = new Date().toISOString();
    const updated: ImagingReportRecord = {
      ...last,
      approved: true,
      approvedBy: actor.actorId ?? "system",
      approvedAt: nowIso,
      portalVisible: input.portalVisible ?? false,
      reviewNotes: input.reviewNotes ?? null,
    };
    const newRevisions = [...existing.reportRevisions.slice(0, -1), updated];
    this.repo.update(tenantId, id, {
      status: "reported",
      reportRevisions: newRevisions,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:imgorder.approve_report",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        revision: last.revision,
        portalVisible: input.portalVisible ?? false,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // amendReport (reported → reported, yeni revision)
  // -------------------------------------------------------------------------

  public async amendReport(
    tenantId: string,
    id: string,
    input: ImagingOrderAmendReportInput,
    actor: ActorContext,
  ): Promise<ImagingOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireOrder(tenantId, id);
    if (existing.status !== "reported" && existing.status !== "amended") {
      throw new DomainError({
        errorCode: "VET-IMG-0009",
        message: `Rapor düzeltmesi için sipariş "reported" durumunda olmalı: ${existing.status}`,
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-IMG-0009",
      });
    }
    if (existing.reportRevisions.length === 0) {
      throw new DomainError({
        errorCode: "VET-IMG-0007",
        message: "Düzeltilecek bir rapor bulunamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-IMG-0007",
      });
    }

    const nowIso = new Date().toISOString();
    const lastRev =
      existing.reportRevisions[existing.reportRevisions.length - 1]!.revision;
    const newRevision: ImagingReportRecord = {
      revision: lastRev + 1,
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
      portalVisible: input.portalVisible ?? false,
      reviewNotes: null,
    };
    this.repo.update(tenantId, id, {
      status: "amended",
      reportRevisions: [...existing.reportRevisions, newRevision],
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:imgorder.amend_report",
      "imgorder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousRevision: lastRev,
        newRevision: newRevision.revision,
        reason: input.reason,
        portalVisible: input.portalVisible ?? false,
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
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "completed", [
      "reported",
      "amended",
    ]);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "completed",
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:imgorder.complete",
      "imgorder",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      { previousStatus: existing.status },
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
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "cancelled", [
      "ordered",
      "scheduled",
    ]);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.reason,
      updatedAt: nowIso,
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

  private requireOrder(tenantId: string, id: string): ImagingOrderRecord {
    const rec = this.repo.findById(tenantId, id);
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

  private fetchUpdated(tenantId: string, id: string): ImagingOrder {
    const updated = this.repo.findById(tenantId, id);
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
