/**
 * @file HospitalizationOrder service.
 * @module apps/api/modules/hospitalization-orders/hospitalization-orders.service
 *
 * @description GOAL-085 (FAZ-8) yatış order + uygulama kayıtları
 * iş kuralları. 2 varlık (HospitalizationOrder, HospitalizationOrderSchedule)
 * tek modülde. Cross-module: HospitalizationService (yatış var mı
 * kontrol).
 *
 * İş kuralları:
 * - `createOrder`: yatış `discharged/cancelled` değilse 422
 *   VET-HORD-0003. Audit.
 * - `updateOrder`: yalnızca active (409 VET-HORD-0004). Audit.
 * - `cancelOrder`: active → cancelled. endsAt set edilir. Audit.
 * - `addSchedule`: yalnızca active order. Audit.
 * - `applySchedule`: scheduledFor pending → appliedAt set.
 *   Audit. Zaten applied/skipped ise 409 VET-HORD-0007.
 * - `skipSchedule`: pending → skippedAt set. Audit. Zaten
 *   applied/skipped ise 409 VET-HORD-0007.
 * - `listOverdueSchedules`: pending + scheduledFor < asOf (now).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import { Injectable, Logger } from "@nestjs/common";

import { HospitalizationOrdersRepository } from "./hospitalization-orders.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toHospitalizationOrder,
  toHospitalizationOrderSchedule,
  type HospitalizationOrderDetail,
  type HospitalizationOrderRecord,
  type HospitalizationOrderScheduleRecord,
} from "../../common/hospitalization-orders/hospitalization-order.types.js";
import { HospitalizationService } from "../hospitalization/hospitalization.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  HospitalizationOrder,
  HospitalizationOrderApplyInput,
  HospitalizationOrderCancelInput,
  HospitalizationOrderCreateInput,
  HospitalizationOrderFilters,
  HospitalizationOrderListResponse,
  HospitalizationOrderSchedule,
  HospitalizationOrderScheduleCreateInput,
  HospitalizationOrderScheduleFilters,
  HospitalizationOrderScheduleListResponse,
  HospitalizationOrderSkipInput,
  HospitalizationOrderUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class HospitalizationOrdersService {
  private readonly logger = new Logger(HospitalizationOrdersService.name);

  public constructor(
    private readonly repo: HospitalizationOrdersRepository,
    private readonly hospitalizations: HospitalizationService,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // ORDER
  // ===========================================================================

  public async createOrder(
    tenantId: string,
    input: HospitalizationOrderCreateInput,
    actor: ActorContext,
  ): Promise<HospitalizationOrder> {
    this.requireTenantScope(actor, tenantId);

    // Yatış var mı ve aktif mi?
    const detail = await this.hospitalizations.getHospitalizationDetail(
      tenantId,
      input.hospitalizationId,
      actor,
    );
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-HORD-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HORD-0001",
        details: { hospitalizationId: input.hospitalizationId },
      });
    }
    const hosp = detail.hospitalization;
    if (hosp.status === "discharged" || hosp.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-HORD-0003",
        message: "Taburcu/iptal edilmiş yatışa order açılamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-HORD-0003",
        details: {
          hospitalizationId: input.hospitalizationId,
          currentStatus: hosp.status,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId, "hor");
    const rec: HospitalizationOrderRecord = {
      id,
      tenantId,
      hospitalizationId: input.hospitalizationId,
      orderType: input.orderType,
      instructions: input.instructions,
      frequency: input.frequency ?? null,
      priority: input.priority ?? "medium",
      status: "active",
      startsAt: input.startsAt ?? nowIso,
      endsAt: input.endsAt ?? null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    await this.repo.persistOrder(rec);

    await this.audit.recordSimple(
      "audit:hospitalization_order.create",
      "hospitalization_order",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        hospitalizationId: input.hospitalizationId,
        orderType: input.orderType,
        priority: rec.priority,
      },
    );

    return toHospitalizationOrder(rec);
  }

  public async listOrders(
    tenantId: string,
    filters: HospitalizationOrderFilters,
    actor: ActorContext,
  ): Promise<HospitalizationOrderListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedOrders(tenantId, {
      hospitalizationId: filters.hospitalizationId,
      orderType: filters.orderType,
      status: filters.status,
      priority: filters.priority,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toHospitalizationOrder(r)),
      total: result.total,
    };
  }

  public async getOrderDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<HospitalizationOrderDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedOrderById(tenantId, id);
    if (!rec) return null;
    return {
      order: toHospitalizationOrder(rec),
      schedules: (await this.repo.persistedSchedules(tenantId, id)).map(
        toHospitalizationOrderSchedule,
      ),
    };
  }

  public async updateOrder(
    tenantId: string,
    id: string,
    input: HospitalizationOrderUpdateInput,
    actor: ActorContext,
  ): Promise<HospitalizationOrder> {
    this.requireTenantScope(actor, tenantId);
    await this.requireActiveOrder(tenantId, id, "güncelleme");
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateOrder(tenantId, id, {
      instructions: input.instructions,
      frequency: input.frequency,
      priority: input.priority,
      endsAt: input.endsAt,
      notes: input.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:hospitalization_order.update",
      "hospitalization_order",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { fieldsChanged: Object.keys(input) },
    );

    const updated = await this.repo.persistedOrderById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HORD-0001",
        message: "Yatış order bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalizationOrder(updated);
  }

  public async cancelOrder(
    tenantId: string,
    id: string,
    input: HospitalizationOrderCancelInput,
    actor: ActorContext,
  ): Promise<HospitalizationOrder> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedOrderById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HORD-0001",
        message: "Yatış order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HORD-0001",
        details: { id },
      });
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-HORD-0005",
        message: "Yalnızca active order iptal edilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HORD-0005",
        details: { id, currentStatus: existing.status },
      });
    }
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateOrder(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.reason,
      endsAt: nowIso,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:hospitalization_order.cancel",
      "hospitalization_order",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      { reason: input.reason },
    );

    const updated = await this.repo.persistedOrderById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HORD-0001",
        message: "Yatış order bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalizationOrder(updated);
  }

  // ===========================================================================
  // SCHEDULE
  // ===========================================================================

  public async addSchedule(
    tenantId: string,
    orderId: string,
    input: HospitalizationOrderScheduleCreateInput,
    actor: ActorContext,
  ): Promise<HospitalizationOrderSchedule> {
    this.requireTenantScope(actor, tenantId);
    const order = await this.requireActiveOrder(
      tenantId,
      orderId,
      "schedule ekleme",
    );
    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId, "hrs");
    const rec: HospitalizationOrderScheduleRecord = {
      id,
      tenantId,
      orderId: order.id,
      scheduledFor: input.scheduledFor,
      appliedAt: null,
      appliedByUserId: null,
      skippedAt: null,
      skippedByUserId: null,
      skipReason: null,
      notes: input.notes ?? null,
      createdAt: nowIso,
    };
    await this.repo.persistSchedule(rec);

    await this.audit.recordSimple(
      "audit:hospitalization_order.schedule_add",
      "hospitalization_order",
      orderId,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        scheduleId: id,
        scheduledFor: input.scheduledFor,
      },
    );

    return toHospitalizationOrderSchedule(rec);
  }

  public async listSchedules(
    tenantId: string,
    filters: HospitalizationOrderScheduleFilters,
    actor: ActorContext,
  ): Promise<HospitalizationOrderScheduleListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearchSchedules(tenantId, {
      orderId: filters.orderId,
      status: filters.status,
      asOf: filters.asOf,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toHospitalizationOrderSchedule(r)),
      total: result.total,
    };
  }

  public async applySchedule(
    tenantId: string,
    scheduleId: string,
    input: HospitalizationOrderApplyInput,
    actor: ActorContext,
  ): Promise<HospitalizationOrderSchedule> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedScheduleById(
      tenantId,
      scheduleId,
    );
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HORD-0002",
        message: "Schedule bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HORD-0002",
        details: { scheduleId },
      });
    }
    if (existing.appliedAt !== null) {
      throw new DomainError({
        errorCode: "VET-HORD-0007",
        message: "Schedule zaten uygulanmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HORD-0007",
        details: { scheduleId, appliedAt: existing.appliedAt },
      });
    }
    if (existing.skippedAt !== null) {
      throw new DomainError({
        errorCode: "VET-HORD-0007",
        message: "Schedule skip edilmiş; uygulanamaz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HORD-0007",
        details: { scheduleId, skippedAt: existing.skippedAt },
      });
    }
    // Order hâlâ active mı?
    const order = await this.repo.persistedOrderById(
      tenantId,
      existing.orderId,
    );
    if (order && order.status !== "active") {
      throw new DomainError({
        errorCode: "VET-HORD-0006",
        message: "Order artık active değil; schedule uygulanamaz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HORD-0006",
        details: {
          scheduleId,
          orderId: existing.orderId,
          orderStatus: order.status,
        },
      });
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateSchedule(tenantId, scheduleId, {
      appliedAt: input.appliedAt ?? nowIso,
      appliedByUserId: actor.actorId ?? "system",
    });

    await this.audit.recordSimple(
      "audit:hospitalization_order.schedule_apply",
      "hospitalization_order",
      existing.orderId,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        scheduleId,
        appliedAt: input.appliedAt ?? nowIso,
      },
    );

    const updated = await this.repo.persistedScheduleById(tenantId, scheduleId);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HORD-0002",
        message: "Schedule bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalizationOrderSchedule(updated);
  }

  public async skipSchedule(
    tenantId: string,
    scheduleId: string,
    input: HospitalizationOrderSkipInput,
    actor: ActorContext,
  ): Promise<HospitalizationOrderSchedule> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedScheduleById(
      tenantId,
      scheduleId,
    );
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HORD-0002",
        message: "Schedule bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HORD-0002",
        details: { scheduleId },
      });
    }
    if (existing.appliedAt !== null) {
      throw new DomainError({
        errorCode: "VET-HORD-0007",
        message: "Schedule uygulanmış; skip edilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HORD-0007",
        details: { scheduleId, appliedAt: existing.appliedAt },
      });
    }
    if (existing.skippedAt !== null) {
      throw new DomainError({
        errorCode: "VET-HORD-0007",
        message: "Schedule zaten skip edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HORD-0007",
        details: { scheduleId, skippedAt: existing.skippedAt },
      });
    }
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateSchedule(tenantId, scheduleId, {
      skippedAt: input.skippedAt ?? nowIso,
      skippedByUserId: actor.actorId ?? "system",
      skipReason: input.reason,
    });

    await this.audit.recordSimple(
      "audit:hospitalization_order.schedule_skip",
      "hospitalization_order",
      existing.orderId,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        scheduleId,
        reason: input.reason,
      },
    );

    const updated = await this.repo.persistedScheduleById(tenantId, scheduleId);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HORD-0002",
        message: "Schedule bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalizationOrderSchedule(updated);
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private async requireActiveOrder(
    tenantId: string,
    id: string,
    subType: string,
  ): Promise<HospitalizationOrderRecord> {
    const rec = await this.repo.persistedOrderById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-HORD-0001",
        message: "Yatış order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HORD-0001",
        details: { id },
      });
    }
    if (rec.status !== "active") {
      throw new DomainError({
        errorCode: "VET-HORD-0004",
        message: `Active olmayan order için ${subType} yapılamaz`,
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HORD-0004",
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
