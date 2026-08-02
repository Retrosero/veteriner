/**
 * @file SurgeryPlan service.
 * @module apps/api/modules/surgery-plans/surgery-plans.service
 *
 * @description GOAL-080 (FAZ-8) ameliyat planı iş kuralları.
 *
 * İş kuralları:
 * - `createPlan` (scheduled):
 *   - `scheduledAt` gelecekte olmalı (422 VET-SURGERY-0006).
 *   - `patientId` UUID formatı; varlık kontrolü sonraki tick'te
 *     (PatientsService entegrasyonu) detaylanır.
 *   - Audit `audit:surgery_plan.create`.
 * - `listPlans` / `getPlanDetail`: tenant-scoped; cross-tenant
 *   → null.
 * - `updatePlan`: yalnızca `scheduled` durumda (409
 *   VET-SURGERY-0002). Audit.
 * - `startPlan`: scheduled → in_progress. Audit.
 * - `completePlan`: in_progress → completed. Audit.
 * - `cancelPlan`: scheduled/in_progress → cancelled. completed
 *   iptal edilemez (409 VET-SURGERY-0003). Audit.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Ameliyat planı üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
 */

import { Injectable, Logger } from "@nestjs/common";

import { SurgeryPlansRepository } from "./surgery-plans.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toSurgeryPlan,
  type SurgeryPlanRecord,
} from "../../common/surgery-plans/surgery-plan.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  SurgeryPlan,
  SurgeryPlanCancelInput,
  SurgeryPlanCreateInput,
  SurgeryPlanFilters,
  SurgeryPlanListResponse,
  SurgeryPlanUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class SurgeryPlansService {
  private readonly logger = new Logger(SurgeryPlansService.name);

  public constructor(
    private readonly repo: SurgeryPlansRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createPlan
  // -------------------------------------------------------------------------

  public async createPlan(
    tenantId: string,
    input: SurgeryPlanCreateInput,
    actor: ActorContext,
  ): Promise<SurgeryPlan> {
    this.requireTenantScope(actor, tenantId);

    // scheduledAt gelecekte olmalı.
    const scheduledAtMs = Date.parse(input.scheduledAt);
    if (Number.isNaN(scheduledAtMs) || scheduledAtMs <= Date.now()) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0006",
        message: "scheduledAt gelecekte olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0006",
        details: { scheduledAt: input.scheduledAt },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: SurgeryPlanRecord = {
      id,
      tenantId,
      patientId: input.patientId,
      leadSurgeonUserId: input.leadSurgeonUserId,
      operationType: input.operationType,
      scheduledAt: input.scheduledAt,
      appointmentId: input.appointmentId ?? null,
      status: "scheduled",
      notes: input.notes ?? null,
      startedAt: null,
      startedBy: null,
      completedAt: null,
      completedBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    await this.repo.persist(record);

    await this.audit.recordSimple(
      "audit:surgery_plan.create",
      "surgery_plan",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: input.patientId,
        leadSurgeonUserId: input.leadSurgeonUserId,
        operationType: input.operationType,
        scheduledAt: input.scheduledAt,
        appointmentId: input.appointmentId ?? null,
      },
    );

    return toSurgeryPlan(record);
  }

  // -------------------------------------------------------------------------
  // listPlans
  // -------------------------------------------------------------------------

  public async listPlans(
    tenantId: string,
    filters: SurgeryPlanFilters,
    actor: ActorContext,
  ): Promise<SurgeryPlanListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      status: filters.status,
      patientId: filters.patientId,
      leadSurgeonUserId: filters.leadSurgeonUserId,
      from: filters.from,
      to: filters.to,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toSurgeryPlan(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getPlanDetail
  // -------------------------------------------------------------------------

  public async getPlanDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<SurgeryPlan | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedById(tenantId, id);
    return rec ? toSurgeryPlan(rec) : null;
  }

  // -------------------------------------------------------------------------
  // updatePlan
  // -------------------------------------------------------------------------

  public async updatePlan(
    tenantId: string,
    id: string,
    input: SurgeryPlanUpdateInput,
    actor: ActorContext,
  ): Promise<SurgeryPlan> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0001",
        details: { id },
      });
    }
    if (existing.status !== "scheduled") {
      throw new DomainError({
        errorCode: "VET-SURGERY-0002",
        message: "Yalnızca planlanmış ameliyatlar düzenlenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0002",
        details: { id, currentStatus: existing.status },
      });
    }
    if (input.scheduledAt !== undefined) {
      const ms = Date.parse(input.scheduledAt);
      if (Number.isNaN(ms) || ms <= Date.now()) {
        throw new DomainError({
          errorCode: "VET-SURGERY-0006",
          message: "scheduledAt gelecekte olmalı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-SURGERY-0006",
        });
      }
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdate(tenantId, id, {
      operationType: input.operationType,
      scheduledAt: input.scheduledAt,
      appointmentId: input.appointmentId,
      notes: input.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:surgery_plan.update",
      "surgery_plan",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { fieldsChanged: Object.keys(input) },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
      });
    }
    return toSurgeryPlan(updated);
  }

  // -------------------------------------------------------------------------
  // startPlan
  // -------------------------------------------------------------------------

  public async startPlan(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<SurgeryPlan> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status !== "scheduled") {
      throw new DomainError({
        errorCode: "VET-SURGERY-0004",
        message: "Yalnızca planlanmış ameliyat başlatılabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0004",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdate(tenantId, id, {
      status: "in_progress",
      startedAt: nowIso,
      startedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:surgery_plan.start",
      "surgery_plan",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: existing.patientId,
        operationType: existing.operationType,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
      });
    }
    return toSurgeryPlan(updated);
  }

  // -------------------------------------------------------------------------
  // completePlan
  // -------------------------------------------------------------------------

  public async completePlan(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<SurgeryPlan> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status !== "in_progress") {
      throw new DomainError({
        errorCode: "VET-SURGERY-0005",
        message: "Yalnızca devam eden ameliyat tamamlanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0005",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdate(tenantId, id, {
      status: "completed",
      completedAt: nowIso,
      completedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:surgery_plan.complete",
      "surgery_plan",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: existing.patientId,
        operationType: existing.operationType,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
      });
    }
    return toSurgeryPlan(updated);
  }

  // -------------------------------------------------------------------------
  // cancelPlan
  // -------------------------------------------------------------------------

  public async cancelPlan(
    tenantId: string,
    id: string,
    input: SurgeryPlanCancelInput,
    actor: ActorContext,
  ): Promise<SurgeryPlan> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status === "completed") {
      throw new DomainError({
        errorCode: "VET-SURGERY-0007",
        message: "Tamamlanmış ameliyat iptal edilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0007",
        details: { id },
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-SURGERY-0003",
        message: "Ameliyat planı zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0003",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdate(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.reason,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:surgery_plan.cancel",
      "surgery_plan",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousStatus: existing.status,
        reason: input.reason,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
      });
    }
    return toSurgeryPlan(updated);
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
