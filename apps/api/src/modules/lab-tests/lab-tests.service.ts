/**
 * @file Lab test kataloğu service.
 * @module apps/api/modules/lab-tests/lab-tests.service
 *
 * @description GOAL-090 (FAZ-9) laboratuvar test kataloğu iş
 * kuralları.
 *
 * İş kuralları:
 * - `createLabTest`: `code` zorunlu ve tenant-scoped unique; aynı
 *   kod 409 VET-LABTEST-0002. Fiyat zorunlu (decimal string).
 *   Audit `audit:labtest.create`.
 * - `listLabTests` / `getLabTestDetail`: tenant-scoped; cross-tenant
 *   → null. Search code ve name'de case-insensitive substring.
 * - `updateLabTest`: kısmi güncelleme. `code` değiştirilemez
 *   (güvenlik + audit kararlılığı). Arşivleme `active=false` ile
 *   yapılır. Audit `audit:labtest.update`.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Fiziksel silme YOKTUR.
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toLabTest,
  type LabTestRecord,
} from "../../common/lab-tests/lab-test.types.js";
import type {
  LabTest,
  LabTestCreateInput,
  LabTestFilters,
  LabTestListResponse,
  LabTestUpdateInput,
} from "@vetniva/contracts";

import { LabTestsRepository } from "./lab-tests.repository.js";

@Injectable()
export class LabTestsService {
  private readonly logger = new Logger(LabTestsService.name);

  public constructor(
    private readonly repo: LabTestsRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createLabTest
  // -------------------------------------------------------------------------

  public async createLabTest(
    tenantId: string,
    input: LabTestCreateInput,
    actor: ActorContext,
  ): Promise<LabTest> {
    this.requireTenantScope(actor, tenantId);

    // Tenant-scoped unique code check
    const dup = this.repo.findByCode(tenantId, input.code);
    if (dup) {
      throw new DomainError({
        errorCode: "VET-LABTEST-0002",
        message: "Bu kod ile kayıtlı bir laboratuvar testi zaten var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-LABTEST-0002",
        details: { code: input.code },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: LabTestRecord = {
      id,
      tenantId,
      code: input.code.trim(),
      name: input.name.trim(),
      sampleType: input.sampleType,
      unit: input.unit.trim(),
      referenceRange: input.referenceRange ?? null,
      conditionalRanges: input.conditionalRanges ?? null,
      price: input.price,
      active: input.active ?? true,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:labtest.create",
      "labtest",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        code: record.code,
        name: record.name,
        sampleType: record.sampleType,
        unit: record.unit,
        price: record.price,
        active: record.active,
      },
    );

    return toLabTest(record);
  }

  // -------------------------------------------------------------------------
  // listLabTests / getLabTestDetail
  // -------------------------------------------------------------------------

  public async listLabTests(
    tenantId: string,
    filters: LabTestFilters,
    actor: ActorContext,
  ): Promise<LabTestListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      sampleType: filters.sampleType,
      active: filters.active,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toLabTest(r)),
      total: result.total,
    };
  }

  public async getLabTestDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<LabTest | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toLabTest(rec) : null;
  }

  // -------------------------------------------------------------------------
  // updateLabTest
  // -------------------------------------------------------------------------

  public async updateLabTest(
    tenantId: string,
    id: string,
    input: LabTestUpdateInput,
    actor: ActorContext,
  ): Promise<LabTest> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-LABTEST-0001",
        message: "Laboratuvar testi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABTEST-0001",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}),
      ...(input.referenceRange !== undefined
        ? { referenceRange: input.referenceRange }
        : {}),
      ...(input.conditionalRanges !== undefined
        ? { conditionalRanges: input.conditionalRanges }
        : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:labtest.update",
      "labtest",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        code: existing.code,
        changes: {
          name: input.name,
          unit: input.unit,
          price: input.price,
          active: input.active,
        },
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-LABTEST-0001",
        message: "Laboratuvar testi bulunamadı",
        httpStatus: 404,
      });
    }
    return toLabTest(updated);
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
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
