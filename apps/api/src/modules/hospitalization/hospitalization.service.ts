/**
 * @file Hospitalization service.
 * @module apps/api/modules/hospitalization/hospitalization.service
 *
 * @description GOAL-084 (FAZ-8) yatış ve kafes yönetimi iş
 * kuralları. 3 varlık (Cage, Hospitalization, CageAssignment) tek
 * modülde.
 *
 * İş kuralları:
 * - `createCage`: aynı tenant'ta code unique (409 VET-HOSP-0006).
 * - `createHospitalization`: aynı patient için aktif (planned /
 *   admitted / active) yatış varsa 409 VET-HOSP-0007.
 * - `admitHospitalization`: planned → admitted. Audit.
 * - `dischargeHospitalization`: active → discharged. Tüm açık
 *   cage assignment'lar (to=null) sonlandırılır. Audit.
 * - `cancelHospitalization`: planned/admitted → cancelled
 *   (409 VET-HOSP-0008 — completed iptal edilemez). Audit.
 * - `assignCage`: aynı cageId için çakışan aktif cage assignment
 *   varsa 409 VET-HOSP-0009. Aynı hospitalization için açık
 *   assignment varsa da reddedilebilir (MVP: bir anda tek kafes).
 * - `endCageAssignment`: to set et; assignment kapanır.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Yatış/kafes üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
 */

import { Injectable, Logger } from "@nestjs/common";

import { HospitalizationRepository } from "./hospitalization.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toCage,
  toCageAssignment,
  toHospitalization,
  type CageAssignmentRecord,
  type CageRecord,
  type HospitalizationDetail,
  type HospitalizationRecord,
} from "../../common/hospitalization/hospitalization.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Cage,
  CageAssignment,
  CageAssignmentCreateInput,
  CageAssignmentEndInput,
  CageCreateInput,
  CageFilters,
  CageListResponse,
  CageUpdateInput,
  Hospitalization,
  HospitalizationAdmitInput,
  HospitalizationCancelInput,
  HospitalizationCreateInput,
  HospitalizationDischargeInput,
  HospitalizationFilters,
  HospitalizationListResponse,
  HospitalizationUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class HospitalizationService {
  private readonly logger = new Logger(HospitalizationService.name);

  public constructor(
    private readonly repo: HospitalizationRepository,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // CAGE
  // ===========================================================================

  public async createCage(
    tenantId: string,
    input: CageCreateInput,
    actor: ActorContext,
  ): Promise<Cage> {
    this.requireTenantScope(actor, tenantId);

    const existing = await this.repo.persistedCageByCode(tenantId, input.code);
    if (existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0006",
        message: "Bu kafes kodu zaten kullanılıyor",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0006",
        details: { code: input.code },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId, "cag");
    const rec: CageRecord = {
      id,
      tenantId,
      code: input.code,
      name: input.name ?? null,
      kind: input.kind,
      capacity: input.capacity,
      active: input.active ?? true,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    await this.repo.persistCage(rec);

    await this.audit.recordSimple(
      "audit:cage.create",
      "cage",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      { code: input.code, kind: input.kind, capacity: input.capacity },
    );

    return toCage(rec);
  }

  public async listCages(
    tenantId: string,
    filters: CageFilters,
    actor: ActorContext,
  ): Promise<CageListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearchCages(tenantId, {
      kind: filters.kind,
      active: filters.active,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toCage(r)),
      total: result.total,
    };
  }

  public async getCage(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Cage | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedCageById(tenantId, id);
    return rec ? toCage(rec) : null;
  }

  public async updateCage(
    tenantId: string,
    id: string,
    input: CageUpdateInput,
    actor: ActorContext,
  ): Promise<Cage> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedCageById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Kafes bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { id },
      });
    }
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateCage(tenantId, id, {
      name: input.name,
      kind: input.kind,
      capacity: input.capacity,
      active: input.active,
      notes: input.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:cage.update",
      "cage",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { fieldsChanged: Object.keys(input) },
    );

    const updated = await this.repo.persistedCageById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Kafes bulunamadı",
        httpStatus: 404,
      });
    }
    return toCage(updated);
  }

  // ===========================================================================
  // HOSPITALIZATION
  // ===========================================================================

  public async createHospitalization(
    tenantId: string,
    input: HospitalizationCreateInput,
    actor: ActorContext,
  ): Promise<Hospitalization> {
    this.requireTenantScope(actor, tenantId);

    // Aynı patient için aktif yatış kontrolü.
    const existing = await this.repo.persistedActiveByPatient(
      tenantId,
      input.patientId,
    );
    if (existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0007",
        message: "Bu hasta için zaten aktif bir yatış var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0007",
        details: {
          patientId: input.patientId,
          existingHospitalizationId: existing.id,
          existingStatus: existing.status,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId, "hos");
    const rec: HospitalizationRecord = {
      id,
      tenantId,
      patientId: input.patientId,
      status: "planned",
      plannedAt: input.plannedAt ?? null,
      admittedAt: null,
      admittedBy: null,
      dischargedAt: null,
      dischargedBy: null,
      cancelReason: null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    await this.repo.persistHospitalization(rec);

    await this.audit.recordSimple(
      "audit:hospitalization.create",
      "hospitalization",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      { patientId: input.patientId, plannedAt: input.plannedAt ?? null },
    );

    return toHospitalization(rec);
  }

  public async listHospitalizations(
    tenantId: string,
    filters: HospitalizationFilters,
    actor: ActorContext,
  ): Promise<HospitalizationListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchHospitalizations(tenantId, {
      status: filters.status,
      patientId: filters.patientId,
      activeOnly: filters.activeOnly,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toHospitalization(r)),
      total: result.total,
    };
  }

  public async getHospitalizationDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<HospitalizationDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!rec) return null;
    return {
      hospitalization: toHospitalization(rec),
      cageAssignments: (await this.repo.persistedAssignments(tenantId, id)).map(
        toCageAssignment,
      ),
    };
  }

  public async updateHospitalization(
    tenantId: string,
    id: string,
    input: HospitalizationUpdateInput,
    actor: ActorContext,
  ): Promise<Hospitalization> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { id },
      });
    }
    if (existing.status === "discharged" || existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-HOSP-0002",
        message: "Taburcu/iptal edilmiş yatış düzenlenemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0002",
        details: { id, currentStatus: existing.status },
      });
    }
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateHospitalization(tenantId, id, {
      plannedAt: input.plannedAt,
      reason: input.reason,
      notes: input.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:hospitalization.update",
      "hospitalization",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { fieldsChanged: Object.keys(input) },
    );

    const updated = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalization(updated);
  }

  public async admitHospitalization(
    tenantId: string,
    id: string,
    input: HospitalizationAdmitInput,
    actor: ActorContext,
  ): Promise<Hospitalization> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { id },
      });
    }
    if (existing.status !== "planned") {
      throw new DomainError({
        errorCode: "VET-HOSP-0003",
        message: "Yalnızca planlanmış yatış kabul edilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0003",
        details: { id, currentStatus: existing.status },
      });
    }
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateHospitalization(tenantId, id, {
      status: "admitted",
      admittedAt: input.admittedAt ?? nowIso,
      admittedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:hospitalization.admit",
      "hospitalization",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { patientId: existing.patientId },
    );

    const updated = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalization(updated);
  }

  public async dischargeHospitalization(
    tenantId: string,
    id: string,
    input: HospitalizationDischargeInput,
    actor: ActorContext,
  ): Promise<Hospitalization> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { id },
      });
    }
    if (existing.status !== "admitted" && existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-HOSP-0004",
        message: "Yalnızca admitted/active yatış taburcu edilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0004",
        details: { id, currentStatus: existing.status },
      });
    }
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateHospitalization(tenantId, id, {
      status: "discharged",
      dischargedAt: input.dischargedAt ?? nowIso,
      dischargedBy: actor.actorId ?? "system",
      reason: input.reason !== undefined ? input.reason : existing.reason,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    // Tüm açık cage assignment'ları sonlandır.
    const assignments = await this.repo.persistedAssignments(tenantId, id);
    for (const a of assignments) {
      if (a.to === null) {
        await this.repo.persistedUpdateAssignment(tenantId, a.id, {
          to: input.dischargedAt ?? nowIso,
        });
      }
    }

    await this.audit.recordSimple(
      "audit:hospitalization.discharge",
      "hospitalization",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: existing.patientId,
        closedAssignments: assignments.filter((a) => a.to === null).length,
      },
    );

    const updated = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalization(updated);
  }

  public async cancelHospitalization(
    tenantId: string,
    id: string,
    input: HospitalizationCancelInput,
    actor: ActorContext,
  ): Promise<Hospitalization> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { id },
      });
    }
    if (existing.status !== "planned" && existing.status !== "admitted") {
      throw new DomainError({
        errorCode: "VET-HOSP-0008",
        message: "Yalnızca planned/admitted yatış iptal edilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0008",
        details: { id, currentStatus: existing.status },
      });
    }
    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdateHospitalization(tenantId, id, {
      status: "cancelled",
      cancelReason: input.reason,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:hospitalization.cancel",
      "hospitalization",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      { reason: input.reason, previousStatus: existing.status },
    );

    const updated = await this.repo.persistedHospitalizationById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
      });
    }
    return toHospitalization(updated);
  }

  // ===========================================================================
  // CAGE ASSIGNMENT
  // ===========================================================================

  public async assignCage(
    tenantId: string,
    hospitalizationId: string,
    input: CageAssignmentCreateInput,
    actor: ActorContext,
  ): Promise<CageAssignment> {
    this.requireTenantScope(actor, tenantId);
    const hospitalization = await this.repo.persistedHospitalizationById(
      tenantId,
      hospitalizationId,
    );
    if (!hospitalization) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { hospitalizationId },
      });
    }
    if (
      hospitalization.status === "discharged" ||
      hospitalization.status === "cancelled"
    ) {
      throw new DomainError({
        errorCode: "VET-HOSP-0005",
        message: "Taburcu/iptal edilmiş yatışa kafes atanamaz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0005",
        details: {
          hospitalizationId,
          currentStatus: hospitalization.status,
        },
      });
    }
    // Cage mevcut ve aktif mi?
    const cage = await this.repo.persistedCageById(tenantId, input.cageId);
    if (!cage) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Kafes bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { cageId: input.cageId },
      });
    }
    if (!cage.active) {
      throw new DomainError({
        errorCode: "VET-HOSP-0010",
        message: "Pasif kafese atama yapılamaz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0010",
        details: { cageId: input.cageId },
      });
    }
    // Aynı hospitalization için açık cage assignment var mı?
    const existingAssignments = await this.repo.persistedAssignments(
      tenantId,
      hospitalizationId,
    );
    const openForHosp = existingAssignments.find((a) => a.to === null);
    if (openForHosp) {
      throw new DomainError({
        errorCode: "VET-HOSP-0011",
        message: "Bu yatış için zaten açık bir kafes ataması var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0011",
        details: {
          hospitalizationId,
          openAssignmentId: openForHosp.id,
        },
      });
    }
    // Aynı kafeste çakışma var mı?
    const overlap = await this.repo.persistedOverlappingAssignment(
      tenantId,
      input.cageId,
      input.from,
      input.to ?? null,
      null,
    );
    if (overlap) {
      throw new DomainError({
        errorCode: "VET-HOSP-0009",
        message: "Bu kafeste zaman çakışması var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0009",
        details: {
          cageId: input.cageId,
          overlappingAssignmentId: overlap.id,
          overlappingFrom: overlap.from,
          overlappingTo: overlap.to,
        },
      });
    }
    if (input.to && input.to <= input.from) {
      throw new DomainError({
        errorCode: "VET-HOSP-0012",
        message: "to değeri from'dan büyük olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0012",
        details: { from: input.from, to: input.to },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId, "cga");
    const rec: CageAssignmentRecord = {
      id,
      tenantId,
      hospitalizationId,
      cageId: input.cageId,
      from: input.from,
      to: input.to ?? null,
      endedBy: null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    };
    await this.repo.persistCageAssignment(rec);

    // planned → active geçişi (kabul gerçekleşmiş ama kafes atanmamışsa).
    if (hospitalization.status === "admitted") {
      await this.repo.persistedUpdateHospitalization(
        tenantId,
        hospitalizationId,
        {
          status: "active",
          updatedAt: nowIso,
        },
      );
    }

    await this.audit.recordSimple(
      "audit:hospitalization.cage_assign",
      "hospitalization",
      hospitalizationId,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        cageAssignmentId: id,
        cageId: input.cageId,
        from: input.from,
        to: input.to ?? null,
      },
    );

    return toCageAssignment(rec);
  }

  public async endCageAssignment(
    tenantId: string,
    assignmentId: string,
    input: CageAssignmentEndInput,
    actor: ActorContext,
  ): Promise<CageAssignment> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedAssignmentById(
      tenantId,
      assignmentId,
    );
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Kafes ataması bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
        details: { assignmentId },
      });
    }
    if (existing.to !== null) {
      throw new DomainError({
        errorCode: "VET-HOSP-0013",
        message: "Kafes ataması zaten sonlanmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0013",
        details: { assignmentId, currentTo: existing.to },
      });
    }
    if (input.to <= existing.from) {
      throw new DomainError({
        errorCode: "VET-HOSP-0012",
        message: "to değeri from'dan büyük olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0012",
        details: { from: existing.from, to: input.to },
      });
    }

    await this.repo.persistedUpdateAssignment(tenantId, assignmentId, {
      to: input.to,
      endedBy: actor.actorId ?? "system",
    });

    await this.audit.recordSimple(
      "audit:hospitalization.cage_end",
      "hospitalization",
      existing.hospitalizationId,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        cageAssignmentId: assignmentId,
        to: input.to,
      },
    );

    const updated = await this.repo.persistedAssignmentById(
      tenantId,
      assignmentId,
    );
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Kafes ataması bulunamadı",
        httpStatus: 404,
      });
    }
    return toCageAssignment(updated);
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

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
