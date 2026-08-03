/**
 * @file Vaccine (aşı protokolü) service.
 * @module apps/api/modules/vaccines/vaccines.service
 *
 * @description GOAL-050 aşı kataloğu ve protokol yönetimi iş
 * kuralları. Protokol bir türe (species) ve kategoriye (core /
 * non_core / lifestyle / not_recommended) bağlı aşı takvimi tanımlar.
 *
 * İş kuralları:
 * - `createProtocol`: steps.length > 0 (boş → 422 VET-VALIDATION-0010);
 *   `totalDurationMonths` son step'ten türetilir; `isCore`
 *   `category='core'` ise true yapılır. Audit
 *   `audit:vaccine.protocol.create` (info).
 * - `listProtocols`: tenant-scoped; species / category / isCore
 *   filtreleri; arşivlenmiş kayıtlar dönmez.
 * - `getProtocol`: tenant-scoped; cross-tenant → null.
 * - `updateProtocol`: kısmi güncelleme; `category` değişirse
 *   `isCore` yeniden türetilir; `steps` değişirse
 *   `totalDurationMonths` yeniden hesaplanır. Audit
 *   `audit:vaccine.protocol.update` (info).
 * - `archiveProtocol`: `archivedAt` set edilir; soft delete. Audit
 *   `audit:vaccine.protocol.archive` (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Protokol üzerinde fiziksel
 *   silme YOKTUR.
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type VaccineProtocolPatch,
  VaccinesRepository,
} from "./vaccines.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  computeTotalDurationMonths,
  toVaccineProtocol,
  type VaccineProtocolRecord,
} from "../../common/vaccines/vaccine.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  VaccineProtocol,
  VaccineProtocolCreateInput,
  VaccineProtocolFilters,
  VaccineProtocolListResponse,
  VaccineProtocolUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class VaccinesService {
  private readonly logger = new Logger(VaccinesService.name);

  public constructor(
    private readonly repo: VaccinesRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createProtocol
  // -------------------------------------------------------------------------

  public async createProtocol(
    tenantId: string,
    input: VaccineProtocolCreateInput,
    actor: ActorContext,
  ): Promise<VaccineProtocol> {
    this.requireTenantScope(actor, tenantId);

    // 1) İş kuralları: steps boş olamaz.
    if (input.steps.length === 0) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "Protokol en az bir aşı adımı içermelidir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { stepsLength: 0 },
      });
    }

    // 2) Türetilmiş alanlar.
    const totalDurationMonths = computeTotalDurationMonths(input.steps);
    const isCore = input.category === "core";
    const now = new Date();
    const nowIso = now.toISOString();

    // 3) Repository'ye ekle.
    const id = this.repo.nextId(tenantId);
    const record: VaccineProtocolRecord = this.repo.toRecord({
      id,
      tenantId,
      name: input.name,
      species: input.species,
      category: input.category,
      manufacturer: input.manufacturer ?? null,
      defaultDose: input.defaultDose ?? null,
      steps: input.steps,
      totalDurationMonths,
      isCore,
      createdAt: nowIso,
      createdBy: actor.actorId,
      updatedAt: nowIso,
      archivedAt: null,
    });
    await this.repo.persist(record);

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:vaccine.protocol.create",
      "vaccine_protocol",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        name: record.name,
        species: record.species,
        category: record.category,
        isCore: record.isCore,
        stepCount: record.steps.length,
        totalDurationMonths: record.totalDurationMonths,
        hasDefaultDose: record.defaultDose !== null,
      },
    );

    return toVaccineProtocol(record);
  }

  // -------------------------------------------------------------------------
  // listProtocols
  // -------------------------------------------------------------------------

  public async listProtocols(
    tenantId: string,
    filters: VaccineProtocolFilters,
    actor: ActorContext,
  ): Promise<VaccineProtocolListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      species: filters.species,
      category: filters.category,
      isCore: filters.isCore,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toVaccineProtocol(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getProtocol
  // -------------------------------------------------------------------------

  public async getProtocol(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<VaccineProtocol | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedById(tenantId, id);
    return rec ? toVaccineProtocol(rec) : null;
  }

  // -------------------------------------------------------------------------
  // updateProtocol
  // -------------------------------------------------------------------------

  public async updateProtocol(
    tenantId: string,
    id: string,
    input: VaccineProtocolUpdateInput,
    actor: ActorContext,
  ): Promise<VaccineProtocol> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı protokolü bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-VACC-0001",
        message: "Arşivlenmiş protokol güncellenemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-VACC-0001",
        details: { id },
      });
    }

    // Mutasyon öncesi audit snapshot (repo update record'u mutate eder).
    const before = {
      name: existing.name,
      category: existing.category,
      isCore: existing.isCore,
      stepCount: existing.steps.length,
      totalDurationMonths: existing.totalDurationMonths,
    };

    // Patch'i oluştur.
    const patch: VaccineProtocolPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.manufacturer !== undefined)
      patch.manufacturer = input.manufacturer;
    if (input.defaultDose !== undefined)
      patch.defaultDose = input.defaultDose ?? null;
    if (input.category !== undefined) {
      patch.category = input.category;
      patch.isCore = input.category === "core";
    }
    if (input.steps !== undefined) {
      patch.steps = input.steps;
      patch.totalDurationMonths = computeTotalDurationMonths(input.steps);
    }
    const nowIso = new Date().toISOString();
    patch.updatedAt = nowIso;

    const updated = await this.repo.persistedUpdate(tenantId, id, patch);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı protokolü bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:vaccine.protocol.update",
      "vaccine_protocol",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before,
        after: {
          name: updated.name,
          category: updated.category,
          isCore: updated.isCore,
          stepCount: updated.steps.length,
          totalDurationMonths: updated.totalDurationMonths,
        },
      },
    );

    return toVaccineProtocol(updated);
  }

  // -------------------------------------------------------------------------
  // archiveProtocol
  // -------------------------------------------------------------------------

  public async archiveProtocol(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı protokolü bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-VACC-0002",
        message: "Protokol zaten arşivlenmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-VACC-0002",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdate(tenantId, id, {
      archivedAt: nowIso,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:vaccine.protocol.archive",
      "vaccine_protocol",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      { name: existing.name, species: existing.species },
    );
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
