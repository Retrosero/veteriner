/**
 * @file Supplier (tedarikçi) service.
 * @module apps/api/modules/suppliers/suppliers.service
 *
 * @description GOAL-062 (FAZ-6) tedarikçi kataloğu iş kuralları.
 *
 * İş kuralları:
 * - `createSupplier`:
 *   - Code tenant içinde benzersiz (duplicate → 409 VET-SUPPLIER-0002).
 *   - Audit `audit:supplier.create` (info).
 * - `listSuppliers`: tenant-scoped; type/active/search filtreleri;
 *   arşivlenmiş kayıtlar dönmez.
 * - `getSupplier`: tenant-scoped; cross-tenant → null.
 * - `updateSupplier`: kısmi güncelleme; arşivli kayıt
 *   güncellenemez (409 VET-SUPPLIER-0004). Code değişirse unique
 *   kontrolü yapılır. Audit `audit:supplier.update` (info).
 * - `archiveSupplier`: `archivedAt` set edilir; soft delete. Zaten
 *   arşivlenmişse 409 VET-SUPPLIER-0003. Audit
 *   `audit:supplier.archive` (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Tedarikçi üzerinde fiziksel
 *   silme YOKTUR.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type SupplierPatch,
  SuppliersRepository,
} from "./suppliers.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toSupplier,
  type SupplierRecord,
} from "../../common/suppliers/supplier.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Supplier,
  SupplierArchiveInput,
  SupplierCreateInput,
  SupplierFilters,
  SupplierListResponse,
  SupplierUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  public constructor(
    private readonly repo: SuppliersRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createSupplier
  // -------------------------------------------------------------------------

  public async createSupplier(
    tenantId: string,
    input: SupplierCreateInput,
    actor: ActorContext,
  ): Promise<Supplier> {
    this.requireTenantScope(actor, tenantId);

    // 1) Code unique kontrolü.
    const existingByCode = await this.repo.persistedByCode(tenantId, input.code);
    if (existingByCode && existingByCode.archivedAt === null) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0002",
        message: "Bu tedarikçi kodu zaten kayıtlı",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0002",
        details: { code: input.code },
      });
    }

    // 2) ID üret.
    const id = this.repo.nextId(tenantId);

    // 3) Repository'ye ekle.
    const nowIso = new Date().toISOString();
    const record: SupplierRecord = this.repo.toRecord({
      id,
      tenantId,
      name: input.name,
      code: input.code,
      type: input.type,
      taxId: input.taxId ?? null,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      active: true,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    });
    await this.repo.persist(record);

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:supplier.create",
      "supplier",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        name: record.name,
        code: record.code,
        type: record.type,
        taxId: record.taxId,
        email: record.email,
        phone: record.phone,
      },
    );

    return toSupplier(record);
  }

  // -------------------------------------------------------------------------
  // listSuppliers
  // -------------------------------------------------------------------------

  public async listSuppliers(
    tenantId: string,
    filters: SupplierFilters,
    actor: ActorContext,
  ): Promise<SupplierListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      type: filters.type,
      active: filters.active,
      search: filters.search,
      includeArchived: false,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toSupplier(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getSupplier
  // -------------------------------------------------------------------------

  public async getSupplier(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Supplier | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedById(tenantId, id);
    return rec ? toSupplier(rec) : null;
  }

  // -------------------------------------------------------------------------
  // updateSupplier
  // -------------------------------------------------------------------------

  public async updateSupplier(
    tenantId: string,
    id: string,
    input: SupplierUpdateInput,
    actor: ActorContext,
  ): Promise<Supplier> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0001",
        message: "Tedarikçi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0004",
        message: "Arşivlenmiş tedarikçi güncellenemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0004",
        details: { id },
      });
    }

    // Code unique kontrolü.
    if (input.code !== undefined && input.code !== existing.code) {
      const dupe = await this.repo.persistedByCode(tenantId, input.code);
      if (dupe && dupe.id !== id && dupe.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-SUPPLIER-0002",
          message: "Bu tedarikçi kodu zaten kayıtlı",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-SUPPLIER-0002",
          details: { code: input.code },
        });
      }
    }

    // Patch oluştur.
    const patch: SupplierPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;
    if (input.type !== undefined) patch.type = input.type;
    if (input.taxId !== undefined) patch.taxId = input.taxId;
    if (input.contactName !== undefined) patch.contactName = input.contactName;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.address !== undefined) patch.address = input.address;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.active !== undefined) patch.active = input.active;

    const nowIso = new Date().toISOString();
    patch.updatedAt = nowIso;

    const updated = await this.repo.persistedUpdate(tenantId, id, patch);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0001",
        message: "Tedarikçi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:supplier.update",
      "supplier",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: {
          name: existing.name,
          type: existing.type,
          email: existing.email,
          phone: existing.phone,
          active: existing.active,
        },
        after: {
          name: updated.name,
          type: updated.type,
          email: updated.email,
          phone: updated.phone,
          active: updated.active,
        },
      },
    );

    return toSupplier(updated);
  }

  // -------------------------------------------------------------------------
  // archiveSupplier
  // -------------------------------------------------------------------------

  public async archiveSupplier(
    tenantId: string,
    id: string,
    input: SupplierArchiveInput,
    actor: ActorContext,
  ): Promise<Supplier> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0001",
        message: "Tedarikçi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0003",
        message: "Tedarikçi zaten arşivlenmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0003",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    const archivedBy = actor.actorId ?? "system";
    const updated = await this.repo.persistedUpdate(tenantId, id, {
      archivedAt: nowIso,
      archivedBy,
      archiveReason: input.reason,
      active: false,
      updatedAt: nowIso,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0001",
        message: "Tedarikçi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:supplier.archive",
      "supplier",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        name: existing.name,
        code: existing.code,
        type: existing.type,
        reason: input.reason,
      },
    );

    return toSupplier(updated);
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
