/**
 * @file Orders service.
 * @module apps/api/modules/orders/orders.service
 *
 * @description GOAL-044 tedavi planı + klinik order iş kuralları.
 * ExaminationsService (GOAL-040) ile entegre: order oluştururken
 * examination aynı tenant'ta mı doğrulanır; patientId examination'dan
 * türetilir.
 *
 * İş kuralları:
 * - `create`: Examination aynı tenant'ta mı (cross-tenant → 404
 *   VET-CLINIC-0001). status='pending'. Audit `audit:order.create`
 *   (info).
 * - `list`: tenant-scoped; patientId / type / status / from / to
 *   filtreleri; pagination.
 * - `start`: status='pending' değilse → 409 VET-ORDER-0001.
 *   status='in_progress'. Audit `audit:order.update` (info).
 * - `complete`: status='in_progress' değilse → 409 VET-ORDER-0001.
 *   status='completed', completedAt+completedBy set. Audit
 *   `audit:order.update` (info).
 * - `cancel`: status='completed' veya 'cancelled' ise → 409
 *   VET-ORDER-0001. status='cancelled', cancelledAt +
 *   cancellationReason set. Audit `audit:order.update` (info).
 * - `getTreatmentPlan`: patient-scoped, aktif (pending+in_progress)
 *   vs tamamlanmış (completed+cancelled) ayrımı.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type OrderRecord,
  OrdersRepository,
  toOrder,
} from "./orders.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ExaminationsService } from "../examinations/examinations.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Order,
  OrderCancelInput,
  OrderCreateInput,
  OrderFilters,
  OrderListResponse,
  OrderTreatmentPlan,
} from "@vetniva/contracts";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  public constructor(
    private readonly repo: OrdersRepository,
    private readonly examinations: ExaminationsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  public async create(
    tenantId: string,
    input: OrderCreateInput,
    actor: ActorContext,
  ): Promise<Order> {
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
    const record: OrderRecord = this.repo.toRecord({
      id,
      tenantId,
      examinationId: exam.id,
      patientId: exam.patientId,
      type: input.type,
      status: "pending",
      description: input.description,
      notes: input.notes ?? null,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      createdBy: actor.actorId ?? "system",
      completedAt: null,
      completedBy: null,
      cancelledAt: null,
      cancellationReason: null,
    });
    this.repo.insert(record);

    // 3) Audit.
    await this.audit.recordSimple(
      "audit:order.create",
      "order",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId: record.examinationId,
        patientId: record.patientId,
        type: record.type,
        status: record.status,
      },
    );

    return toOrder(record);
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  public async list(
    tenantId: string,
    filters: OrderFilters,
    actor: ActorContext,
  ): Promise<OrderListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      patientId: filters.patientId,
      type: filters.type,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toOrder(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------

  public async start(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Order> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "pending") {
      throw new DomainError({
        errorCode: "VET-ORDER-0001",
        message: "Yalnızca beklemedeki order başlatılabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ORDER-0001",
        details: { id, status: existing.status },
      });
    }

    const updated = this.repo.update(tenantId, id, {
      status: "in_progress",
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:order.update",
      "order",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        action: "start",
        before: { status: existing.status },
        after: { status: updated.status },
      },
    );

    return toOrder(updated);
  }

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  public async complete(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Order> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "in_progress") {
      throw new DomainError({
        errorCode: "VET-ORDER-0001",
        message: "Yalnızca devam eden order tamamlanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ORDER-0001",
        details: { id, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    const actorId = actor.actorId ?? "system";
    const updated = this.repo.update(tenantId, id, {
      status: "completed",
      completedAt: now,
      completedBy: actorId,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:order.update",
      "order",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        action: "complete",
        before: { status: existing.status, completedAt: existing.completedAt },
        after: { status: updated.status, completedAt: updated.completedAt },
      },
    );

    return toOrder(updated);
  }

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  public async cancel(
    tenantId: string,
    id: string,
    input: OrderCancelInput,
    actor: ActorContext,
  ): Promise<Order> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-ORDER-0001",
        message: "Tamamlanmış veya iptal edilmiş order iptal edilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ORDER-0001",
        details: { id, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    const updated = this.repo.update(tenantId, id, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: input.reason,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:order.update",
      "order",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        action: "cancel",
        before: { status: existing.status },
        after: { status: updated.status, cancellationReason: input.reason },
      },
    );

    return toOrder(updated);
  }

  // -------------------------------------------------------------------------
  // getTreatmentPlan
  // -------------------------------------------------------------------------

  public async getTreatmentPlan(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<OrderTreatmentPlan> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      patientId,
      limit: 200,
      offset: 0,
    });
    const active: Order[] = [];
    const completed: Order[] = [];
    for (const rec of result.items) {
      const order = toOrder(rec);
      if (order.status === "pending" || order.status === "in_progress") {
        active.push(order);
      } else {
        completed.push(order);
      }
    }
    return { patientId, active, completed };
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
