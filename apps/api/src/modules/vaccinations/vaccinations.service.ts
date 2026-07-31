/**
 * @file Vaccination (aşı uygulama kaydı) service.
 * @module apps/api/modules/vaccinations/vaccinations.service
 *
 * @description GOAL-051 aşı uygulama kaydı iş kuralları. Bir
 * hayvana uygulanan aşının klinik kaydını tutar; sonraki tarihi
 * protokol adımlarından türetir; iptal edebilir. Lot numarası
 * tenant + protokol kapsamında tekildir (duplicate → 409
 * VET-VACC-0003).
 *
 * İş kuralları:
 * - `record`:
 *   - patient aynı tenant'ta mı (cross-tenant → 404 VET-CLINIC-0001).
 *   - protocol aynı tenant'ta mı (cross-tenant → 404 VET-VACC-0004).
 *   - status='administered'.
 *   - `nextDueAt`, protokolün `steps`'inden türetilir.
 *   - `lotNumber` aynı tenant + protokol altında tekil olmalı
 *     (duplicate → 409 VET-VACC-0003).
 *   - Audit `audit:vaccination.create` (info).
 * - `list`: tenant-scoped; patientId / protocolId / status /
 *   from / to filtreleri; en yeni kayıt üstte.
 * - `findById`: tenant-scoped; cross-tenant → null.
 * - `getNextDue`: status='administered' + `nextDueAt` gelecekte
 *   olanlar.
 * - `getOverdue`: status='administered' + `nextDueAt` geçmişte
 *   olanlar.
 * - `cancel`: status='cancelled' + `cancelledAt` +
 *   `cancellationReason`. Zaten iptal ise → 409 VET-VACC-0008.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Fiziksel silme YOKTUR.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toVaccination,
  type VaccinationCreate,
  type VaccinationFilters,
  type VaccinationRecord,
  type VaccinationStatus,
} from "../../common/vaccinations/vaccination.types.js";
import type { PatientsService } from "../patients/patients.service.js";
import type { VaccinesService } from "../vaccines/vaccines.service.js";
import type {
  Vaccination,
  VaccinationListResponse,
  VaccineProtocol,
  VaccineProtocolStep,
} from "@vetniva/contracts";

import { VaccinationsRepository } from "./vaccinations.repository.js";

@Injectable()
export class VaccinationsService {
  private readonly logger = new Logger(VaccinationsService.name);

  public constructor(
    private readonly repo: VaccinationsRepository,
    private readonly patients: PatientsService,
    private readonly vaccines: VaccinesService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // record
  // -------------------------------------------------------------------------

  public async record(
    tenantId: string,
    input: VaccinationCreate,
    actor: ActorContext,
  ): Promise<Vaccination> {
    this.requireTenantScope(actor, tenantId);

    // 1) Patient doğrula (cross-tenant → 404).
    const patient = await this.patients.findById(
      tenantId,
      input.patientId,
      actor,
    );
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId: input.patientId },
      });
    }

    // 2) Protocol doğrula (cross-tenant → 404).
    const protocol = await this.vaccines.getProtocol(
      tenantId,
      input.protocolId,
      actor,
    );
    if (!protocol) {
      throw new DomainError({
        errorCode: "VET-VACC-0004",
        message: "Aşı protokolü bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-VACC-0004",
        details: { protocolId: input.protocolId },
      });
    }

    // 3) Lot numarası tenant + protokol kapsamında tekil olmalı.
    if (this.repo.lotExists(tenantId, input.protocolId, input.lotNumber)) {
      throw new DomainError({
        errorCode: "VET-VACC-0003",
        message: "Bu lot numarası bu protokol için zaten kullanılmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-VACC-0003",
        details: {
          protocolId: input.protocolId,
          lotNumber: input.lotNumber,
        },
      });
    }

    // 4) Alanlar.
    const nowIso = new Date().toISOString();
    const administeredAt = input.administeredAt ?? nowIso;
    const veterinarianId = actor.actorId ?? "system";
    const nextDueAt = this.computeNextDueAt(protocol, administeredAt);

    // 5) Kayıt.
    const id = this.repo.nextId(tenantId);
    const record: VaccinationRecord = {
      id,
      tenantId,
      patientId: patient.id,
      veterinarianId,
      protocolId: protocol.id,
      vaccineName: input.vaccineName,
      dose: input.dose,
      lotNumber: input.lotNumber,
      manufacturer: input.manufacturer ?? null,
      administeredAt,
      nextDueAt,
      status: "administered",
      notes: input.notes ?? null,
      createdBy: veterinarianId,
      createdAt: nowIso,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.repo.insert(record);

    // 6) Audit.
    await this.audit.recordSimple(
      "audit:vaccination.create",
      "vaccination",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: patient.id,
        protocolId: protocol.id,
        protocolName: protocol.name,
        vaccineName: input.vaccineName,
        dose: input.dose,
        lotNumber: input.lotNumber,
        manufacturer: input.manufacturer ?? null,
        administeredAt,
        nextDueAt,
      },
    );

    return toVaccination(record);
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  public async list(
    tenantId: string,
    filters: VaccinationFilters,
    actor: ActorContext,
  ): Promise<VaccinationListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      patientId: filters.patientId,
      protocolId: filters.protocolId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
    });
    return {
      items: result.items.map((r) => toVaccination(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Vaccination | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toVaccination(rec) : null;
  }

  // -------------------------------------------------------------------------
  // getNextDue / getOverdue
  // -------------------------------------------------------------------------

  public async getNextDue(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<Vaccination[]> {
    this.requireTenantScope(actor, tenantId);
    const nowIso = new Date().toISOString();
    const recs = this.repo.listByPatient(tenantId, patientId, "administered");
    return recs
      .filter((r) => r.nextDueAt !== null && r.nextDueAt > nowIso)
      .map(toVaccination);
  }

  public async getOverdue(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<Vaccination[]> {
    this.requireTenantScope(actor, tenantId);
    const nowIso = new Date().toISOString();
    const recs = this.repo.listByPatient(tenantId, patientId, "administered");
    return recs
      .filter((r) => r.nextDueAt !== null && r.nextDueAt <= nowIso)
      .map(toVaccination);
  }

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  public async cancel(
    tenantId: string,
    id: string,
    reason: string,
    actor: ActorContext,
  ): Promise<Vaccination> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-VACC-0008",
        message: "Aşı kaydı zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-VACC-0008",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    const updated = this.repo.update(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancellationReason: reason,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:vaccination.cancel",
      "vaccination",
      id,
      "cancel",
      this.actorToAuditActor(actor),
      "warning",
      {
        reason,
        patientId: existing.patientId,
        protocolId: existing.protocolId,
      },
    );

    return toVaccination(updated);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Protokolün adımlarından bir sonraki uygulama tarihini
   * türetir. Birden çok adım varsa ikinci adımın `ageWeeks`'i
   * kullanılır; tek adım + `boosterIntervalDays` varsa o
   * kullanılır; aksi hâlde null.
   */
  private computeNextDueAt(
    protocol: VaccineProtocol,
    administeredAt: string,
  ): string | null {
    const steps: VaccineProtocolStep[] = protocol.steps;
    if (steps.length === 0) return null;

    const administered = new Date(administeredAt);
    if (Number.isNaN(administered.getTime())) return null;

    if (steps.length >= 2) {
      // İlk iki adım arasındaki fark (hafta) → gün.
      const first = steps[0]?.ageWeeks ?? 0;
      const second = steps[1]?.ageWeeks ?? 0;
      const days = Math.max(0, (second - first) * 7);
      const next = new Date(administered.getTime() + days * 86_400_000);
      return next.toISOString();
    }

    // Tek adım: boosterIntervalDays varsa onu kullan.
    const only = steps[0];
    if (only && typeof only.boosterIntervalDays === "number") {
      const next = new Date(
        administered.getTime() + only.boosterIntervalDays * 86_400_000,
      );
      return next.toISOString();
    }

    return null;
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

// `VaccinationStatus` tipi ileride service içinde (sorgu
// filtreleri vb.) doğrudan kullanılabilmesi için yeniden
// dışa aktarılır.
export type { VaccinationStatus };
