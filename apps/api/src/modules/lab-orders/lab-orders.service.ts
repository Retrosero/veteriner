/**
 * @file Lab order service.
 * @module apps/api/modules/lab-orders/lab-orders.service
 *
 * @description GOAL-091 (FAZ-9) laboratuvar isteği iş kuralları.
 *
 * State machine:
 * - `ordered` → `collected` → `processing` → `completed`
 * - `ordered | collected` → `cancelled`
 *
 * İş kuralları:
 * - `createLabOrder`: `labTestId` katalogdan çekilir; pasif
 *   katalog reddedilir (422 VET-LABORD-0004). Katalog
 *   snapshot'ı (code/name/sampleType/unit/referenceRange/price)
 *   order üzerinde dondurulur. Audit `audit:laborder.create`.
 * - `collectSample` (ordered → collected): collectedAt +
 *   collectedByUserId + sampleQuality set. Audit
 *   `audit:laborder.collect`.
 * - `startProcessing` (collected → processing): sentAt + notes.
 *   Audit.
 * - `completeLabOrder` (processing → completed): completedAt set.
 *   Audit. (Sonuç değerleri henüz girilmedi — GOAL-092.)
 * - `cancelLabOrder` (ordered|collected → cancelled): reason
 *   zorunlu. processing/completed/cancelled → 409 VET-LABORD-0002.
 * - `getLabOrderDetail` / `listLabOrders`: tenant-scoped.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Cross-tenant IDOR → null. Fiziksel silme YOKTUR; düzeltme
 *   `cancelled` durumuna geçişle yapılır.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 */

import { Injectable, Logger } from "@nestjs/common";

import { LabOrdersRepository } from "./lab-orders.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toLabOrder,
  type LabOrderRecord,
} from "../../common/lab-orders/lab-order.types.js";
import { LabTestsService } from "../lab-tests/lab-tests.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  LabOrder,
  LabOrderCancelInput,
  LabOrderCollectSampleInput,
  LabOrderCompleteInput,
  LabOrderCreateInput,
  LabOrderFilters,
  LabOrderListResponse,
  LabOrderStartProcessingInput,
  LabOrderStatus,
} from "@vetniva/contracts";

@Injectable()
export class LabOrdersService {
  private readonly logger = new Logger(LabOrdersService.name);

  public constructor(
    private readonly repo: LabOrdersRepository,
    private readonly labTests: LabTestsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createLabOrder
  // -------------------------------------------------------------------------

  public async createLabOrder(
    tenantId: string,
    input: LabOrderCreateInput,
    actor: ActorContext,
  ): Promise<LabOrder> {
    this.requireTenantScope(actor, tenantId);

    // Katalog kontrolü (kendi tenant içinde)
    const test = await this.labTests.getLabTestDetail(
      tenantId,
      input.labTestId,
      actor,
    );
    if (!test) {
      throw new DomainError({
        errorCode: "VET-LABORD-0003",
        message: "Katalogda böyle bir laboratuvar testi bulunamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-LABORD-0003",
        details: { labTestId: input.labTestId },
      });
    }
    if (!test.active) {
      throw new DomainError({
        errorCode: "VET-LABORD-0004",
        message: "Katalogda bu test pasif durumda; sipariş açılamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-LABORD-0004",
        details: { labTestId: input.labTestId },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: LabOrderRecord = {
      id,
      tenantId,
      patientId: input.patientId,
      labTestId: input.labTestId,
      // Snapshot (katalog sonradan değişse bile order'ın anlık görüntüsü)
      labTestCode: test.code,
      labTestName: test.name,
      sampleType: test.sampleType,
      unit: test.unit,
      referenceRange: test.referenceRange,
      price: test.price,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      priority: input.priority,
      status: "ordered",
      collectedAt: null,
      collectedByUserId: null,
      sampleQuality: null,
      processingStartedAt: null,
      completedAt: null,
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
      "audit:laborder.create",
      "laborder",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: input.patientId,
        labTestId: input.labTestId,
        labTestCode: test.code,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        priority: input.priority,
      },
    );

    return toLabOrder(record);
  }

  // -------------------------------------------------------------------------
  // listLabOrders / getLabOrderDetail
  // -------------------------------------------------------------------------

  public async listLabOrders(
    tenantId: string,
    filters: LabOrderFilters,
    actor: ActorContext,
  ): Promise<LabOrderListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      status: filters.status,
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
      items: result.items.map((r) => toLabOrder(r)),
      total: result.total,
    };
  }

  public async getLabOrderDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<LabOrder | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toLabOrder(rec) : null;
  }

  // -------------------------------------------------------------------------
  // collectSample (ordered → collected)
  // -------------------------------------------------------------------------

  public async collectSample(
    tenantId: string,
    id: string,
    input: LabOrderCollectSampleInput,
    actor: ActorContext,
  ): Promise<LabOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "collected", ["ordered"]);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "collected",
      collectedAt: input.collectedAt,
      collectedByUserId: input.collectedByUserId,
      sampleQuality: input.sampleQuality ?? "ok",
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:laborder.collect",
      "laborder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        collectedAt: input.collectedAt,
        collectedByUserId: input.collectedByUserId,
        sampleQuality: input.sampleQuality ?? "ok",
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // startProcessing (collected → processing)
  // -------------------------------------------------------------------------

  public async startProcessing(
    tenantId: string,
    id: string,
    input: LabOrderStartProcessingInput,
    actor: ActorContext,
  ): Promise<LabOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "processing", ["collected"]);

    const nowIso = new Date().toISOString();
    const sentAt = input.sentAt ?? nowIso;
    this.repo.update(tenantId, id, {
      status: "processing",
      processingStartedAt: sentAt,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:laborder.start_processing",
      "laborder",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        sentAt,
        labReference: input.labReference ?? null,
      },
    );

    return this.fetchUpdated(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // completeLabOrder (processing → completed)
  // -------------------------------------------------------------------------

  public async completeLabOrder(
    tenantId: string,
    id: string,
    input: LabOrderCompleteInput,
    actor: ActorContext,
  ): Promise<LabOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "completed", ["processing"]);

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "completed",
      completedAt: nowIso,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:laborder.complete",
      "laborder",
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
  // cancelLabOrder (ordered|collected → cancelled)
  // -------------------------------------------------------------------------

  public async cancelLabOrder(
    tenantId: string,
    id: string,
    input: LabOrderCancelInput,
    actor: ActorContext,
  ): Promise<LabOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireOrder(tenantId, id);
    this.requireStateTransition(existing.status, "cancelled", [
      "ordered",
      "collected",
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
      "audit:laborder.cancel",
      "laborder",
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

  private requireOrder(tenantId: string, id: string): LabOrderRecord {
    const rec = this.repo.findById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-LABORD-0001",
        message: "Laboratuvar isteği bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABORD-0001",
        details: { id },
      });
    }
    return rec;
  }

  private requireStateTransition(
    current: LabOrderStatus,
    target: LabOrderStatus,
    allowedFrom: LabOrderStatus[],
  ): void {
    if (allowedFrom.includes(current)) return;
    throw new DomainError({
      errorCode: "VET-LABORD-0002",
      message: `Geçersiz durum geçişi: ${current} → ${target}`,
      httpStatus: 409,
      severity: "warning",
      i18nKey: "error.VET-LABORD-0002",
      details: { current, target, allowedFrom },
    });
  }

  private fetchUpdated(tenantId: string, id: string): LabOrder {
    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-LABORD-0001",
        message: "Laboratuvar isteği bulunamadı",
        httpStatus: 404,
      });
    }
    return toLabOrder(updated);
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
