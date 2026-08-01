/**
 * @file DischargeSummaries service.
 * @module apps/api/modules/discharge-summaries/discharge-summaries.service
 * @description GOAL-086 (FAZ-8) gözlem kayıtları + taburcu özeti
 * iş kuralları. 2 varlık (Observation, DischargeSummary) tek
 * modülde. Cross-module: HospitalizationService (yatış var mı
 * kontrol).
 *
 * İş kuralları:
 * - `addObservation`: yatış `discharged/cancelled` değilse
 *   eklenebilir (422 VET-DSUM-0003). Audit.
 * - `createDischargeSummary`: yatış `discharged` olmalı
 *   (422 VET-DSUM-0004). Aynı yatış için aktif (draft/
 *   finalized) summary varsa 409 VET-DSUM-0005. Audit.
 * - `updateDischargeSummary`: yalnızca draft (409 VET-DSUM-0006). Audit.
 * - `finalizeDischargeSummary`: draft → finalized, PDF
 *   üretildi flag'i set edilir (gerçek üretim worker'da).
 *   Audit.
 * - `amendDischargeSummary`: finalized → amended; yeni revision
 *   (draft) oluşur. Audit.
 * - `sharePortal`: portalShared = true + portalSharedAt = now.
 *   Yalnızca finalized (409 VET-DSUM-0007). Audit.
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 * @since GOAL-086 (FAZ-8) gözlem ve taburcu özeti core
 */

import { Injectable, Logger } from "@nestjs/common";

import { DischargeSummariesRepository } from "./discharge-summaries.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import {
  toDischargeSummary,
  toObservation,
  type DischargeSummaryRecord,
  type ObservationRecord,
} from "../../common/discharge-summaries/discharge-summary.types.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { HospitalizationService } from "../hospitalization/hospitalization.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  DischargeSummary,
  DischargeSummaryAmendInput,
  DischargeSummaryCreateInput,
  DischargeSummaryFinalizeInput,
  DischargeSummaryUpdateInput,
  Observation,
  ObservationCreateInput,
  ObservationFilters,
  ObservationListResponse,
} from "@vetniva/contracts";

@Injectable()
export class DischargeSummariesService {
  private readonly logger = new Logger(DischargeSummariesService.name);

  public constructor(
    private readonly repo: DischargeSummariesRepository,
    private readonly hospitalizations: HospitalizationService,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // OBSERVATION
  // ===========================================================================

  public async addObservation(
    tenantId: string,
    hospitalizationId: string,
    input: ObservationCreateInput,
    actor: ActorContext,
  ): Promise<Observation> {
    this.requireTenantScope(actor, tenantId);
    const hosp = await this.hospitalizations.getHospitalizationDetail(
      tenantId,
      hospitalizationId,
      actor,
    );
    if (!hosp) {
      throw new DomainError({
        errorCode: "VET-DSUM-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0001",
        details: { hospitalizationId },
      });
    }
    if (
      hosp.hospitalization.status === "discharged" ||
      hosp.hospitalization.status === "cancelled"
    ) {
      throw new DomainError({
        errorCode: "VET-DSUM-0003",
        message: "Taburcu/iptal edilmiş yatışa gözlem eklenemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0003",
        details: {
          hospitalizationId,
          currentStatus: hosp.hospitalization.status,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId, "obs");
    const rec: ObservationRecord = {
      id,
      tenantId,
      hospitalizationId,
      kind: input.kind,
      observedAt: input.observedAt ?? nowIso,
      value: input.value,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    };
    this.repo.insertObservation(rec);

    await this.audit.recordSimple(
      "audit:observation.create",
      "observation",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        hospitalizationId,
        kind: input.kind,
      },
    );

    return toObservation(rec);
  }

  public async listObservations(
    tenantId: string,
    filters: ObservationFilters,
    actor: ActorContext,
  ): Promise<ObservationListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchObservations(tenantId, {
      hospitalizationId: filters.hospitalizationId,
      kind: filters.kind,
      from: filters.from,
      to: filters.to,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toObservation(r)),
      total: result.total,
    };
  }

  // ===========================================================================
  // DISCHARGE SUMMARY
  // ===========================================================================

  public async createDischargeSummary(
    tenantId: string,
    hospitalizationId: string,
    input: DischargeSummaryCreateInput,
    actor: ActorContext,
  ): Promise<DischargeSummary> {
    this.requireTenantScope(actor, tenantId);
    const hosp = await this.hospitalizations.getHospitalizationDetail(
      tenantId,
      hospitalizationId,
      actor,
    );
    if (!hosp) {
      throw new DomainError({
        errorCode: "VET-DSUM-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0001",
        details: { hospitalizationId },
      });
    }
    if (hosp.hospitalization.status !== "discharged") {
      throw new DomainError({
        errorCode: "VET-DSUM-0004",
        message: "Taburcu özeti yalnızca discharged yatış için oluşturulabilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0004",
        details: {
          hospitalizationId,
          currentStatus: hosp.hospitalization.status,
        },
      });
    }
    // Aynı yatış için aktif (draft/finalized) summary var mı?
    const existing = this.repo.findActiveSummaryByHosp(
      tenantId,
      hospitalizationId,
    );
    if (existing) {
      throw new DomainError({
        errorCode: "VET-DSUM-0005",
        message: "Bu yatış için zaten aktif bir taburcu özeti var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0005",
        details: {
          hospitalizationId,
          existingSummaryId: existing.id,
          existingStatus: existing.status,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId, "dsm");
    const rec: DischargeSummaryRecord = {
      id,
      tenantId,
      hospitalizationId,
      status: "draft",
      clinicalSummary: input.clinicalSummary,
      treatments: input.treatments ?? null,
      homeInstructions: input.homeInstructions ?? null,
      medications: input.medications ?? [],
      followUpDate: input.followUpDate ?? null,
      portalShared: false,
      portalSharedAt: null,
      pdfGenerated: false,
      pdfGeneratedAt: null,
      finalizedAt: null,
      finalizedBy: null,
      amendsSummaryId: null,
      amendmentReason: null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insertSummary(rec);

    await this.audit.recordSimple(
      "audit:discharge_summary.create",
      "discharge_summary",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        hospitalizationId,
        medicationCount: rec.medications.length,
      },
    );

    return toDischargeSummary(rec);
  }

  public async getDischargeSummary(
    tenantId: string,
    hospitalizationId: string,
    actor: ActorContext,
  ): Promise<DischargeSummary | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findActiveSummaryByHosp(tenantId, hospitalizationId);
    return rec ? toDischargeSummary(rec) : null;
  }

  public async updateDischargeSummary(
    tenantId: string,
    hospitalizationId: string,
    input: DischargeSummaryUpdateInput,
    actor: ActorContext,
  ): Promise<DischargeSummary> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findActiveSummaryByHosp(
      tenantId,
      hospitalizationId,
    );
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0002",
        details: { hospitalizationId },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-DSUM-0006",
        message: "Yalnızca draft özet güncellenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0006",
        details: {
          id: existing.id,
          currentStatus: existing.status,
        },
      });
    }
    const nowIso = new Date().toISOString();
    this.repo.updateSummary(tenantId, existing.id, {
      clinicalSummary: input.clinicalSummary,
      treatments: input.treatments,
      homeInstructions: input.homeInstructions,
      medications: input.medications,
      followUpDate: input.followUpDate,
      notes: input.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:discharge_summary.update",
      "discharge_summary",
      existing.id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { fieldsChanged: Object.keys(input) },
    );

    const updated = this.repo.findSummaryById(tenantId, existing.id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
      });
    }
    return toDischargeSummary(updated);
  }

  public async finalizeDischargeSummary(
    tenantId: string,
    hospitalizationId: string,
    input: DischargeSummaryFinalizeInput,
    actor: ActorContext,
  ): Promise<DischargeSummary> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findActiveSummaryByHosp(
      tenantId,
      hospitalizationId,
    );
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0002",
        details: { hospitalizationId },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-DSUM-0006",
        message: "Yalnızca draft özet finalize edilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0006",
        details: {
          id: existing.id,
          currentStatus: existing.status,
        },
      });
    }
    const nowIso = new Date().toISOString();
    this.repo.updateSummary(tenantId, existing.id, {
      status: "finalized",
      finalizedAt: nowIso,
      finalizedBy: actor.actorId ?? "system",
      pdfGenerated: true,
      pdfGeneratedAt: nowIso,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:discharge_summary.finalize",
      "discharge_summary",
      existing.id,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      { medicationCount: existing.medications.length },
    );

    const updated = this.repo.findSummaryById(tenantId, existing.id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
      });
    }
    return toDischargeSummary(updated);
  }

  public async amendDischargeSummary(
    tenantId: string,
    hospitalizationId: string,
    input: DischargeSummaryAmendInput,
    actor: ActorContext,
  ): Promise<DischargeSummary> {
    this.requireTenantScope(actor, tenantId);
    const original = this.repo.findActiveSummaryByHosp(
      tenantId,
      hospitalizationId,
    );
    if (!original) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0002",
        details: { hospitalizationId },
      });
    }
    if (original.status !== "finalized") {
      throw new DomainError({
        errorCode: "VET-DSUM-0008",
        message:
          "Yalnızca finalize edilmiş taburcu özeti amendment ile düzeltilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0008",
        details: { id: original.id, currentStatus: original.status },
      });
    }
    const nowIso = new Date().toISOString();

    // Orijinali amended işaretle.
    this.repo.updateSummary(tenantId, original.id, {
      status: "amended",
      updatedAt: nowIso,
    });

    // Yeni revision (draft) oluştur.
    const newId = this.repo.nextId(tenantId, "dsm");
    const amendment: DischargeSummaryRecord = {
      id: newId,
      tenantId,
      hospitalizationId: original.hospitalizationId,
      status: "draft",
      clinicalSummary: original.clinicalSummary,
      treatments: original.treatments,
      homeInstructions: original.homeInstructions,
      medications: original.medications,
      followUpDate: original.followUpDate,
      portalShared: false,
      portalSharedAt: null,
      pdfGenerated: false,
      pdfGeneratedAt: null,
      finalizedAt: null,
      finalizedBy: null,
      amendsSummaryId: original.id,
      amendmentReason: input.reason,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insertSummary(amendment);

    await this.audit.recordSimple(
      "audit:discharge_summary.amend",
      "discharge_summary",
      newId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        amendsSummaryId: original.id,
        reason: input.reason,
      },
    );

    return toDischargeSummary(amendment);
  }

  public async shareDischargeSummaryPortal(
    tenantId: string,
    hospitalizationId: string,
    actor: ActorContext,
  ): Promise<DischargeSummary> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findActiveSummaryByHosp(
      tenantId,
      hospitalizationId,
    );
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0002",
        details: { hospitalizationId },
      });
    }
    if (existing.status !== "finalized") {
      throw new DomainError({
        errorCode: "VET-DSUM-0007",
        message: "Yalnızca finalized özet portal'a paylaşılabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0007",
        details: { id: existing.id, currentStatus: existing.status },
      });
    }
    const nowIso = new Date().toISOString();
    this.repo.updateSummary(tenantId, existing.id, {
      portalShared: true,
      portalSharedAt: nowIso,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:discharge_summary.portal_share",
      "discharge_summary",
      existing.id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { patientId: undefined },
    );

    const updated = this.repo.findSummaryById(tenantId, existing.id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
      });
    }
    return toDischargeSummary(updated);
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
