/**
 * @file Anesthesia service.
 * @module apps/api/modules/anesthesia/anesthesia.service
 *
 * @description GOAL-082 (FAZ-8) ameliyat içi anestezi takip iş
 * kuralları. Bir ameliyat planı (surgeryPlan) ile birebir ilişkili
 * tek bir anestezi kaydı; alt kayıtlar (ilaç, vital, komplikasyon,
 * personel) append-only zaman-bazlı tutulur.
 *
 * İş kuralları:
 * - `createAnesthesia`:
 *   - `surgeryPlanId` mevcut ve `in_progress` durumda olmalı
 *     (422 VET-ANESTHESIA-0003 — plan henüz başlatılmamış).
 *   - Aynı plan için mevcut anesthesia reddedilir
 *     (409 VET-ANESTHESIA-0004 — bir plan = tek takip).
 *   - Audit `audit:anesthesia.create`.
 * - `listAnesthesias` / `getAnesthesiaDetail`: tenant-scoped;
 *   cross-tenant → null.
 * - `addMedication` / `addVital` / `addComplication` / `assignStaff`:
 *   yalnızca `draft` durumda (409 VET-ANESTHESIA-0002 —
 *   finalized). Audit.
 * - `finalizeAnesthesia`: draft → finalized, recoveryAt set,
 *   finalizedAt/finalizedBy set, tüm alt kayıtlar append-only.
 *   Audit.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Anestezi kaydı üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-082 (FAZ-8) anestezi takip core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toAnesthesia,
  toAnesthesiaComplication,
  toAnesthesiaMedication,
  toAnesthesiaStaff,
  toAnesthesiaVital,
  type AnesthesiaComplicationRecord,
  type AnesthesiaMedicationRecord,
  type AnesthesiaRecord,
  type AnesthesiaStaffRecord,
  type AnesthesiaVitalRecord,
} from "../../common/anesthesia/anesthesia.types.js";
import type {
  Anesthesia,
  AnesthesiaDetail,
  AnesthesiaComplication,
  AnesthesiaComplicationInput,
  AnesthesiaCreateInput,
  AnesthesiaFilters,
  AnesthesiaFinalizeInput,
  AnesthesiaListResponse,
  AnesthesiaMedication,
  AnesthesiaMedicationInput,
  AnesthesiaStaff,
  AnesthesiaStaffInput,
  AnesthesiaVital,
  AnesthesiaVitalInput,
} from "@vetniva/contracts";

import { AnesthesiaRepository } from "./anesthesia.repository.js";
import { SurgeryPlansService } from "../surgery-plans/surgery-plans.service.js";

@Injectable()
export class AnesthesiaService {
  private readonly logger = new Logger(AnesthesiaService.name);

  public constructor(
    private readonly repo: AnesthesiaRepository,
    private readonly surgeryPlans: SurgeryPlansService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createAnesthesia
  // -------------------------------------------------------------------------

  public async createAnesthesia(
    tenantId: string,
    input: AnesthesiaCreateInput,
    actor: ActorContext,
  ): Promise<Anesthesia> {
    this.requireTenantScope(actor, tenantId);

    // Plan in_progress olmalı.
    const plan = await this.surgeryPlans.getPlanDetail(
      tenantId,
      input.surgeryPlanId,
      actor,
    );
    if (!plan) {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0003",
        message: "Anestezi yalnızca mevcut bir ameliyat planı için açılabilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0003",
        details: { surgeryPlanId: input.surgeryPlanId },
      });
    }
    if (plan.status !== "in_progress") {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0003",
        message:
          "Anestezi yalnızca devam eden (in_progress) ameliyat için açılabilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0003",
        details: { surgeryPlanId: input.surgeryPlanId, planStatus: plan.status },
      });
    }
    if (plan.patientId !== input.patientId) {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0003",
        message: "patientId ameliyat planı ile aynı olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0003",
        details: {
          surgeryPlanId: input.surgeryPlanId,
          planPatientId: plan.patientId,
          inputPatientId: input.patientId,
        },
      });
    }

    // Aynı plan için mevcut anesthesia reddedilir.
    const existing = this.repo.findBySurgeryPlanId(
      tenantId,
      input.surgeryPlanId,
    );
    if (existing) {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0004",
        message: "Bu ameliyat planı için zaten bir anestezi kaydı var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0004",
        details: {
          surgeryPlanId: input.surgeryPlanId,
          existingAnesthesiaId: existing.id,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: AnesthesiaRecord = {
      id,
      tenantId,
      surgeryPlanId: input.surgeryPlanId,
      patientId: input.patientId,
      protocol: input.protocol,
      protocolNotes: input.protocolNotes ?? null,
      status: "draft",
      inductionAt: input.inductionAt ?? null,
      recoveryAt: null,
      finalizedAt: null,
      finalizedBy: null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:anesthesia.create",
      "anesthesia",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        surgeryPlanId: input.surgeryPlanId,
        patientId: input.patientId,
        protocol: input.protocol,
      },
    );

    return toAnesthesia(record);
  }

  // -------------------------------------------------------------------------
  // listAnesthesias
  // -------------------------------------------------------------------------

  public async listAnesthesias(
    tenantId: string,
    filters: AnesthesiaFilters,
    actor: ActorContext,
  ): Promise<AnesthesiaListResponse> {
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
      items: result.items.map((r) => toAnesthesia(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getAnesthesiaDetail
  // -------------------------------------------------------------------------

  public async getAnesthesiaDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<AnesthesiaDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    if (!rec) return null;
    return {
      anesthesia: toAnesthesia(rec),
      medications: this.repo
        .listMedications(tenantId, id)
        .map(toAnesthesiaMedication),
      vitals: this.repo.listVitals(tenantId, id).map(toAnesthesiaVital),
      complications: this.repo
        .listComplications(tenantId, id)
        .map(toAnesthesiaComplication),
      staff: this.repo.listStaff(tenantId, id).map(toAnesthesiaStaff),
    };
  }

  // -------------------------------------------------------------------------
  // addMedication
  // -------------------------------------------------------------------------

  public async addMedication(
    tenantId: string,
    id: string,
    input: AnesthesiaMedicationInput,
    actor: ActorContext,
  ): Promise<AnesthesiaMedication> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireDraftAnesthesia(tenantId, id, "ilaç");
    const nowIso = new Date().toISOString();
    const subId = this.repo.nextSubId(tenantId, "anm");
    const rec: AnesthesiaMedicationRecord = {
      id: subId,
      tenantId,
      anesthesiaId: existing.id,
      medicationName: input.medicationName,
      dose: input.dose,
      route: input.route,
      administeredAt: input.administeredAt,
      administeredByUserId: input.administeredByUserId,
      notes: input.notes ?? null,
      createdAt: nowIso,
    };
    this.repo.insertMedication(rec);
    this.repo.update(tenantId, id, { updatedAt: nowIso });

    await this.audit.recordSimple(
      "audit:anesthesia.medication_add",
      "anesthesia",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        medicationId: subId,
        medicationName: input.medicationName,
        dose: input.dose,
        route: input.route,
      },
    );

    return toAnesthesiaMedication(rec);
  }

  // -------------------------------------------------------------------------
  // addVital
  // -------------------------------------------------------------------------

  public async addVital(
    tenantId: string,
    id: string,
    input: AnesthesiaVitalInput,
    actor: ActorContext,
  ): Promise<AnesthesiaVital> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireDraftAnesthesia(tenantId, id, "vital");
    const nowIso = new Date().toISOString();
    const subId = this.repo.nextSubId(tenantId, "anv");
    const rec: AnesthesiaVitalRecord = {
      id: subId,
      tenantId,
      anesthesiaId: existing.id,
      kind: input.kind,
      value: input.value,
      unit: input.unit,
      observedAt: input.observedAt,
      observedByUserId: input.observedByUserId,
      notes: input.notes ?? null,
      createdAt: nowIso,
    };
    this.repo.insertVital(rec);
    this.repo.update(tenantId, id, { updatedAt: nowIso });

    await this.audit.recordSimple(
      "audit:anesthesia.vital_add",
      "anesthesia",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        vitalId: subId,
        kind: input.kind,
        value: input.value,
        unit: input.unit,
      },
    );

    return toAnesthesiaVital(rec);
  }

  // -------------------------------------------------------------------------
  // addComplication
  // -------------------------------------------------------------------------

  public async addComplication(
    tenantId: string,
    id: string,
    input: AnesthesiaComplicationInput,
    actor: ActorContext,
  ): Promise<AnesthesiaComplication> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireDraftAnesthesia(tenantId, id, "komplikasyon");
    const nowIso = new Date().toISOString();
    const subId = this.repo.nextSubId(tenantId, "anc");
    const rec: AnesthesiaComplicationRecord = {
      id: subId,
      tenantId,
      anesthesiaId: existing.id,
      description: input.description,
      severity: input.severity,
      occurredAt: input.occurredAt,
      resolvedAt: input.resolvedAt ?? null,
      reportedByUserId: input.reportedByUserId,
      action: input.action ?? null,
      createdAt: nowIso,
    };
    this.repo.insertComplication(rec);
    this.repo.update(tenantId, id, { updatedAt: nowIso });

    await this.audit.recordSimple(
      "audit:anesthesia.complication_add",
      "anesthesia",
      id,
      "update",
      this.actorToAuditActor(actor),
      "warning",
      {
        complicationId: subId,
        severity: input.severity,
      },
    );

    return toAnesthesiaComplication(rec);
  }

  // -------------------------------------------------------------------------
  // assignStaff
  // -------------------------------------------------------------------------

  public async assignStaff(
    tenantId: string,
    id: string,
    input: AnesthesiaStaffInput,
    actor: ActorContext,
  ): Promise<AnesthesiaStaff> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireDraftAnesthesia(tenantId, id, "personel");
    const nowIso = new Date().toISOString();
    const subId = this.repo.nextSubId(tenantId, "ans");
    const rec: AnesthesiaStaffRecord = {
      id: subId,
      tenantId,
      anesthesiaId: existing.id,
      userId: input.userId,
      role: input.role,
      assignedAt: input.assignedAt,
      endedAt: input.endedAt ?? null,
      notes: input.notes ?? null,
      createdAt: nowIso,
    };
    this.repo.insertStaff(rec);
    this.repo.update(tenantId, id, { updatedAt: nowIso });

    await this.audit.recordSimple(
      "audit:anesthesia.staff_assign",
      "anesthesia",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        staffId: subId,
        userId: input.userId,
        role: input.role,
      },
    );

    return toAnesthesiaStaff(rec);
  }

  // -------------------------------------------------------------------------
  // finalizeAnesthesia
  // -------------------------------------------------------------------------

  public async finalizeAnesthesia(
    tenantId: string,
    id: string,
    input: AnesthesiaFinalizeInput,
    actor: ActorContext,
  ): Promise<Anesthesia> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0001",
        message: "Anestezi kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0001",
        details: { id },
      });
    }
    if (existing.status === "finalized") {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0002",
        message: "Anestezi kaydı zaten finalize edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0002",
        details: { id, finalizedAt: existing.finalizedAt },
      });
    }

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "finalized",
      recoveryAt: input.recoveryAt ?? nowIso,
      finalizedAt: nowIso,
      finalizedBy: actor.actorId ?? "system",
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:anesthesia.finalize",
      "anesthesia",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      {
        surgeryPlanId: existing.surgeryPlanId,
        recoveryAt: input.recoveryAt ?? nowIso,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0001",
        message: "Anestezi kaydı bulunamadı",
        httpStatus: 404,
      });
    }
    return toAnesthesia(updated);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** draft durumda olmalı; değilse 409 VET-ANESTHESIA-0002. */
  private requireDraftAnesthesia(
    tenantId: string,
    id: string,
    subType: string,
  ): AnesthesiaRecord {
    const rec = this.repo.findById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0001",
        message: "Anestezi kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0001",
        details: { id },
      });
    }
    if (rec.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0002",
        message: `Finalize edilmiş anestezi kaydına ${subType} eklenemez`,
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0002",
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
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
