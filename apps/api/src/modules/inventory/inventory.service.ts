/**
 * @file Inventory (depo/raf/lot) service.
 * @module apps/api/modules/inventory/inventory.service
 *
 * @description GOAL-061 (FAZ-6) depo, raf, lot ve SKT iş kuralları.
 * Üç temel varlık yönetimi:
 * - Warehouse: CRUD + arşiv (kod tenant-içi benzersiz).
 * - Shelf: CRUD + arşiv (kod depo-içi benzersiz; arşivleme
 *   bağımlı lotlar yüzünden engellenebilir).
 * - StockLot: CRUD + arşiv (lot numarası productId bazında
 *   benzersiz; SKT geçmiş kontrolü; arşivleme yine aktif lot
 *   varsa yapılabilir ama lot hareketleri GOAL-063+ ile bağlanır).
 *
 * **Stok miktarı bu tablolarda TUTULMAZ.** Miktar yalnızca
 * hareketlerden hesaplanır (GOAL-063+). Buradaki `quantity`
 * alanı yalnızca lot alındığındaki başlangıç miktarıdır ve
 * audit amaçlıdır.
 *
 * İş kuralları:
 * - **Warehouse create**: `code` tenant-içi benzersiz; duplicate
 *   → 409 VET-INV-0001. Audit `audit:inventory.warehouse.create`.
 * - **Warehouse update**: arşivli → 409 VET-INV-0009. `code`
 *   değişirse unique kontrolü.
 * - **Warehouse archive**: arşivli → 409 VET-INV-0009. Aktif
 *   raf varsa → 409 VET-INV-0002.
 * - **Shelf create**: warehouse var olmalı (404 VET-INV-0001);
 *   arşivli depoda raf oluşturulamaz (409 VET-INV-0009).
 *   `code` verildiyse depo-içi benzersiz (409 VET-INV-0004).
 * - **Shelf update**: arşivli → 409 VET-INV-0009.
 * - **Shelf archive**: arşivli → 409 VET-INV-0009. Aktif lot
 *   varsa → 409 VET-INV-0003.
 * - **StockLot create**: SKT bugünden küçükse 422 VET-INV-0008.
 *   lotNumber productId bazında benzersiz (409 VET-INV-0006).
 *   shelfId verildiyse raf mevcut olmalı (404 VET-INV-0002).
 * - **StockLot update**: arşivli → 409 VET-INV-0009. SKT
 *   değişirse yine geçmiş kontrolü.
 * - **StockLot archive**: arşivli → 409 VET-INV-0009.
 * - Audit: tüm mutasyonlar audit trail'e yazılır.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Fiziksel silme YOKTUR.
 *
 * @since GOAL-061 (FAZ-6) depo, raf, lot ve SKT core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  isExpired,
  normalizeLotQuantity,
  toShelf,
  toStockLot,
  toWarehouse,
  type ShelfRecord,
  type StockLotRecord,
  type WarehouseRecord,
} from "../../common/inventory/inventory.types.js";
import type {
  Shelf,
  ShelfArchiveInput,
  ShelfCreateInput,
  ShelfFilters,
  ShelfListResponse,
  ShelfUpdateInput,
  StockLot,
  StockLotArchiveInput,
  StockLotCreateInput,
  StockLotFilters,
  StockLotListResponse,
  StockLotUpdateInput,
  Warehouse,
  WarehouseArchiveInput,
  WarehouseCreateInput,
  WarehouseFilters,
  WarehouseListResponse,
  WarehouseUpdateInput,
} from "@vetniva/contracts";

import {
  type ShelfPatch,
  type StockLotPatch,
  type WarehousePatch,
  InventoryRepository,
} from "./inventory.repository.js";

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  public constructor(
    private readonly repo: InventoryRepository,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // Warehouse
  // =========================================================================

  public async createWarehouse(
    tenantId: string,
    input: WarehouseCreateInput,
    actor: ActorContext,
  ): Promise<Warehouse> {
    this.requireTenantScope(actor, tenantId);

    // Code unique kontrolü.
    const existing = this.repo.findWarehouseByCode(tenantId, input.code);
    if (existing && existing.archivedAt === null) {
      throw new DomainError({
        errorCode: "VET-INV-0004",
        message: "Bu depo kodu zaten kayıtlı",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-INV-0004",
        details: { code: input.code },
      });
    }

    const id = this.repo.nextWarehouseId(tenantId);
    const nowIso = new Date().toISOString();
    const record: WarehouseRecord = {
      id,
      tenantId,
      name: input.name,
      code: input.code,
      type: input.type,
      address: input.address ?? null,
      notes: input.notes ?? null,
      active: true,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    this.repo.insertWarehouse(record);

    await this.audit.recordSimple(
      "audit:inventory.warehouse.create",
      "warehouse",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        name: record.name,
        code: record.code,
        type: record.type,
        hasAddress: record.address !== null,
        hasNotes: record.notes !== null,
      },
    );

    return toWarehouse(record);
  }

  public async listWarehouses(
    tenantId: string,
    filters: WarehouseFilters,
    actor: ActorContext,
  ): Promise<WarehouseListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchWarehouses(tenantId, {
      type: filters.type,
      active: filters.active,
      search: filters.search,
      includeArchived: false,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toWarehouse(r)),
      total: result.total,
    };
  }

  public async getWarehouse(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Warehouse | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findWarehouseById(tenantId, id);
    return rec ? toWarehouse(rec) : null;
  }

  public async updateWarehouse(
    tenantId: string,
    id: string,
    input: WarehouseUpdateInput,
    actor: ActorContext,
  ): Promise<Warehouse> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findWarehouseById(tenantId, id);
    if (!existing) {
      throw this.notFoundWarehouseError(id);
    }
    if (existing.archivedAt !== null) {
      throw this.archivedCannotUpdateError("depo");
    }

    if (input.code !== undefined && input.code !== existing.code) {
      const dupe = this.repo.findWarehouseByCode(tenantId, input.code);
      if (dupe && dupe.id !== id && dupe.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-INV-0004",
          message: "Bu depo kodu zaten kayıtlı",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-INV-0004",
          details: { code: input.code },
        });
      }
    }

    const patch: WarehousePatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;
    if (input.type !== undefined) patch.type = input.type;
    if (input.address !== undefined) patch.address = input.address;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.active !== undefined) patch.active = input.active;
    patch.updatedAt = new Date().toISOString();

    const updated = this.repo.updateWarehouse(tenantId, id, patch);
    if (!updated) throw this.notFoundWarehouseError(id);

    await this.audit.recordSimple(
      "audit:inventory.warehouse.update",
      "warehouse",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: {
          name: existing.name,
          code: existing.code,
          type: existing.type,
          active: existing.active,
        },
        after: {
          name: updated.name,
          code: updated.code,
          type: updated.type,
          active: updated.active,
        },
      },
    );

    return toWarehouse(updated);
  }

  public async archiveWarehouse(
    tenantId: string,
    id: string,
    input: WarehouseArchiveInput,
    actor: ActorContext,
  ): Promise<Warehouse> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findWarehouseById(tenantId, id);
    if (!existing) throw this.notFoundWarehouseError(id);
    if (existing.archivedAt !== null) throw this.archivedCannotArchiveError("depo");

    // Aktif raf varsa arşivlenemez.
    const activeShelves = this.repo.countActiveShelvesForWarehouse(
      tenantId,
      id,
    );
    if (activeShelves > 0) {
      throw new DomainError({
        errorCode: "VET-INV-0010",
        message: "Bu depoda aktif raflar var; önce rafları arşivleyin",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-INV-0010",
        details: { id, activeShelves },
      });
    }

    const nowIso = new Date().toISOString();
    const updated = this.repo.updateWarehouse(tenantId, id, {
      archivedAt: nowIso,
      archivedBy: actor.actorId ?? "system",
      archiveReason: input.reason,
      active: false,
      updatedAt: nowIso,
    });
    if (!updated) throw this.notFoundWarehouseError(id);

    await this.audit.recordSimple(
      "audit:inventory.warehouse.archive",
      "warehouse",
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

    return toWarehouse(updated);
  }

  // =========================================================================
  // Shelf
  // =========================================================================

  public async createShelf(
    tenantId: string,
    input: ShelfCreateInput,
    actor: ActorContext,
  ): Promise<Shelf> {
    this.requireTenantScope(actor, tenantId);

    const warehouse = this.repo.findWarehouseById(tenantId, input.warehouseId);
    if (!warehouse) {
      throw this.notFoundWarehouseError(input.warehouseId);
    }
    if (warehouse.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-INV-0008",
        message: "Arşivlenmiş depoya raf eklenemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-INV-0008",
        details: { warehouseId: input.warehouseId },
      });
    }

    if (input.code !== undefined) {
      const dupe = this.repo.findShelfByCode(
        tenantId,
        input.warehouseId,
        input.code,
      );
      if (dupe && dupe.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-INV-0005",
          message: "Bu raf kodu depoda zaten mevcut",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-INV-0005",
          details: { warehouseId: input.warehouseId, code: input.code },
        });
      }
    }

    const id = this.repo.nextShelfId(tenantId);
    const nowIso = new Date().toISOString();
    const record: ShelfRecord = {
      id,
      tenantId,
      warehouseId: input.warehouseId,
      name: input.name,
      code: input.code ?? null,
      temperatureZone: input.temperatureZone,
      notes: input.notes ?? null,
      active: true,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    this.repo.insertShelf(record);

    await this.audit.recordSimple(
      "audit:inventory.shelf.create",
      "shelf",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        name: record.name,
        code: record.code,
        warehouseId: record.warehouseId,
        temperatureZone: record.temperatureZone,
      },
    );

    return toShelf(record);
  }

  public async listShelves(
    tenantId: string,
    filters: ShelfFilters,
    actor: ActorContext,
  ): Promise<ShelfListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchShelves(tenantId, {
      warehouseId: filters.warehouseId,
      temperatureZone: filters.temperatureZone,
      active: filters.active,
      search: filters.search,
      includeArchived: false,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toShelf(r)),
      total: result.total,
    };
  }

  public async getShelf(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Shelf | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findShelfById(tenantId, id);
    return rec ? toShelf(rec) : null;
  }

  public async updateShelf(
    tenantId: string,
    id: string,
    input: ShelfUpdateInput,
    actor: ActorContext,
  ): Promise<Shelf> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findShelfById(tenantId, id);
    if (!existing) throw this.notFoundShelfError(id);
    if (existing.archivedAt !== null) throw this.archivedCannotUpdateError("raf");

    if (input.code !== undefined && input.code !== existing.code) {
      if (input.code !== null) {
        const dupe = this.repo.findShelfByCode(
          tenantId,
          existing.warehouseId,
          input.code,
        );
        if (dupe && dupe.id !== id && dupe.archivedAt === null) {
          throw new DomainError({
            errorCode: "VET-INV-0005",
            message: "Bu raf kodu depoda zaten mevcut",
            httpStatus: 409,
            severity: "warning",
            i18nKey: "error.VET-INV-0005",
            details: { code: input.code },
          });
        }
      }
    }

    const patch: ShelfPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;
    if (input.temperatureZone !== undefined)
      patch.temperatureZone = input.temperatureZone;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.active !== undefined) patch.active = input.active;
    patch.updatedAt = new Date().toISOString();

    const updated = this.repo.updateShelf(tenantId, id, patch);
    if (!updated) throw this.notFoundShelfError(id);

    await this.audit.recordSimple(
      "audit:inventory.shelf.update",
      "shelf",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: {
          name: existing.name,
          code: existing.code,
          temperatureZone: existing.temperatureZone,
          active: existing.active,
        },
        after: {
          name: updated.name,
          code: updated.code,
          temperatureZone: updated.temperatureZone,
          active: updated.active,
        },
      },
    );

    return toShelf(updated);
  }

  public async archiveShelf(
    tenantId: string,
    id: string,
    input: ShelfArchiveInput,
    actor: ActorContext,
  ): Promise<Shelf> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findShelfById(tenantId, id);
    if (!existing) throw this.notFoundShelfError(id);
    if (existing.archivedAt !== null) throw this.archivedCannotArchiveError("raf");

    // Aktif lot varsa arşivlenemez.
    const activeLots = this.repo.countActiveLotsForShelf(tenantId, id);
    if (activeLots > 0) {
      throw new DomainError({
        errorCode: "VET-INV-0010",
        message: "Bu rafta aktif lotlar var; önce lotları arşivleyin",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-INV-0010",
        details: { id, activeLots },
      });
    }

    const nowIso = new Date().toISOString();
    const updated = this.repo.updateShelf(tenantId, id, {
      archivedAt: nowIso,
      archivedBy: actor.actorId ?? "system",
      archiveReason: input.reason,
      active: false,
      updatedAt: nowIso,
    });
    if (!updated) throw this.notFoundShelfError(id);

    await this.audit.recordSimple(
      "audit:inventory.shelf.archive",
      "shelf",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        name: existing.name,
        code: existing.code,
        warehouseId: existing.warehouseId,
        reason: input.reason,
      },
    );

    return toShelf(updated);
  }

  // =========================================================================
  // StockLot
  // =========================================================================

  public async createLot(
    tenantId: string,
    input: StockLotCreateInput,
    actor: ActorContext,
  ): Promise<StockLot> {
    this.requireTenantScope(actor, tenantId);

    // SKT geçmiş kontrolü.
    if (isExpired(input.expiryDate)) {
      throw new DomainError({
        errorCode: "VET-INV-0009",
        message: "Son kullanma tarihi geçmiş olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-INV-0009",
        details: { expiryDate: input.expiryDate },
      });
    }

    // Lot numarası unique per product.
    const dupe = this.repo.findLotByProductAndNumber(
      tenantId,
      input.productId,
      input.lotNumber,
    );
    if (dupe && dupe.archivedAt === null) {
      throw new DomainError({
        errorCode: "VET-INV-0006",
        message: "Bu lot numarası ürün için zaten kayıtlı",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-INV-0006",
        details: {
          productId: input.productId,
          lotNumber: input.lotNumber,
        },
      });
    }

    // Raf opsiyonel; verildiyse kontrol.
    if (input.shelfId !== undefined && input.shelfId !== null) {
      const shelf = this.repo.findShelfById(tenantId, input.shelfId);
      if (!shelf) {
        throw this.notFoundShelfError(input.shelfId);
      }
      if (shelf.archivedAt !== null) {
        throw new DomainError({
          errorCode: "VET-INV-0008",
          message: "Arşivlenmiş rafa lot eklenemez",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-INV-0008",
          details: { shelfId: input.shelfId },
        });
      }
    }

    const quantity = input.quantity !== undefined
      ? normalizeLotQuantity(input.quantity)
      : null;
    if (input.quantity !== undefined && quantity === null) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "quantity geçersiz format",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { field: "quantity", value: input.quantity },
      });
    }

    const id = this.repo.nextLotId(tenantId);
    const nowIso = new Date().toISOString();
    const record: StockLotRecord = {
      id,
      tenantId,
      productId: input.productId,
      lotNumber: input.lotNumber,
      expiryDate: input.expiryDate,
      manufacturedAt: input.manufacturedAt ?? null,
      receivedAt: input.receivedAt ?? nowIso,
      supplierName: input.supplierName ?? null,
      shelfId: input.shelfId ?? null,
      quantity,
      notes: input.notes ?? null,
      active: true,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    this.repo.insertLot(record);

    await this.audit.recordSimple(
      "audit:inventory.lot.create",
      "stock_lot",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        productId: record.productId,
        lotNumber: record.lotNumber,
        expiryDate: record.expiryDate,
        shelfId: record.shelfId,
        supplierName: record.supplierName,
        quantity: record.quantity,
        isExpired: isExpired(record.expiryDate),
      },
    );

    return toStockLot(record);
  }

  public async listLots(
    tenantId: string,
    filters: StockLotFilters,
    actor: ActorContext,
  ): Promise<StockLotListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchLots(tenantId, {
      productId: filters.productId,
      shelfId: filters.shelfId,
      warehouseId: filters.warehouseId,
      expiresBefore: filters.expiresBefore,
      expiresAfter: filters.expiresAfter,
      expiredOnly: filters.expiredOnly,
      supplierName: filters.supplierName,
      lotNumber: filters.lotNumber,
      active: filters.active,
      search: filters.search,
      includeArchived: false,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toStockLot(r)),
      total: result.total,
    };
  }

  public async getLot(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<StockLot | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findLotById(tenantId, id);
    return rec ? toStockLot(rec) : null;
  }

  public async updateLot(
    tenantId: string,
    id: string,
    input: StockLotUpdateInput,
    actor: ActorContext,
  ): Promise<StockLot> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findLotById(tenantId, id);
    if (!existing) throw this.notFoundLotError(id);
    if (existing.archivedAt !== null) throw this.archivedCannotUpdateError("lot");

    // SKT değişirse yine geçmiş kontrolü.
    if (input.expiryDate !== undefined && isExpired(input.expiryDate)) {
      throw new DomainError({
        errorCode: "VET-INV-0009",
        message: "Son kullanma tarihi geçmiş olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-INV-0009",
        details: { expiryDate: input.expiryDate },
      });
    }

    // lotNumber değişirse unique kontrolü.
    if (
      input.lotNumber !== undefined &&
      input.lotNumber !== existing.lotNumber
    ) {
      const dupe = this.repo.findLotByProductAndNumber(
        tenantId,
        existing.productId,
        input.lotNumber,
      );
      if (dupe && dupe.id !== id && dupe.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-INV-0006",
          message: "Bu lot numarası ürün için zaten kayıtlı",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-INV-0006",
          details: {
            productId: existing.productId,
            lotNumber: input.lotNumber,
          },
        });
      }
    }

    // shelfId değişirse mevcut kontrolü.
    if (input.shelfId !== undefined && input.shelfId !== existing.shelfId) {
      if (input.shelfId !== null) {
        const shelf = this.repo.findShelfById(tenantId, input.shelfId);
        if (!shelf) throw this.notFoundShelfError(input.shelfId);
        if (shelf.archivedAt !== null) {
          throw new DomainError({
            errorCode: "VET-INV-0008",
            message: "Arşivlenmiş rafa lot atanamaz",
            httpStatus: 409,
            severity: "warning",
            i18nKey: "error.VET-INV-0008",
            details: { shelfId: input.shelfId },
          });
        }
      }
    }

    // Quantity format kontrolü.
    if (input.quantity !== undefined && input.quantity !== null) {
      const normalized = normalizeLotQuantity(input.quantity);
      if (normalized === null) {
        throw new DomainError({
          errorCode: "VET-VALIDATION-0010",
          message: "quantity geçersiz format",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-VALIDATION-0010",
          details: { field: "quantity", value: input.quantity },
        });
      }
    }

    const patch: StockLotPatch = {};
    if (input.lotNumber !== undefined) patch.lotNumber = input.lotNumber;
    if (input.expiryDate !== undefined) patch.expiryDate = input.expiryDate;
    if (input.manufacturedAt !== undefined)
      patch.manufacturedAt = input.manufacturedAt;
    if (input.receivedAt !== undefined) patch.receivedAt = input.receivedAt;
    if (input.supplierName !== undefined)
      patch.supplierName = input.supplierName;
    if (input.shelfId !== undefined) patch.shelfId = input.shelfId;
    if (input.quantity !== undefined) patch.quantity = input.quantity;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.active !== undefined) patch.active = input.active;
    patch.updatedAt = new Date().toISOString();

    const updated = this.repo.updateLot(tenantId, id, patch);
    if (!updated) throw this.notFoundLotError(id);

    await this.audit.recordSimple(
      "audit:inventory.lot.update",
      "stock_lot",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: {
          lotNumber: existing.lotNumber,
          expiryDate: existing.expiryDate,
          shelfId: existing.shelfId,
          active: existing.active,
        },
        after: {
          lotNumber: updated.lotNumber,
          expiryDate: updated.expiryDate,
          shelfId: updated.shelfId,
          active: updated.active,
        },
      },
    );

    return toStockLot(updated);
  }

  public async archiveLot(
    tenantId: string,
    id: string,
    input: StockLotArchiveInput,
    actor: ActorContext,
  ): Promise<StockLot> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findLotById(tenantId, id);
    if (!existing) throw this.notFoundLotError(id);
    if (existing.archivedAt !== null) throw this.archivedCannotArchiveError("lot");

    const nowIso = new Date().toISOString();
    const updated = this.repo.updateLot(tenantId, id, {
      archivedAt: nowIso,
      archivedBy: actor.actorId ?? "system",
      archiveReason: input.reason,
      active: false,
      updatedAt: nowIso,
    });
    if (!updated) throw this.notFoundLotError(id);

    await this.audit.recordSimple(
      "audit:inventory.lot.archive",
      "stock_lot",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        productId: existing.productId,
        lotNumber: existing.lotNumber,
        expiryDate: existing.expiryDate,
        reason: input.reason,
      },
    );

    return toStockLot(updated);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

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

  private notFoundWarehouseError(id: string): DomainError {
    return new DomainError({
      errorCode: "VET-INV-0001",
      message: "Depo bulunamadı",
      httpStatus: 404,
      severity: "warning",
      i18nKey: "error.VET-INV-0001",
      details: { id },
    });
  }

  private notFoundShelfError(id: string): DomainError {
    return new DomainError({
      errorCode: "VET-INV-0002",
      message: "Raf bulunamadı",
      httpStatus: 404,
      severity: "warning",
      i18nKey: "error.VET-INV-0002",
      details: { id },
    });
  }

  private notFoundLotError(id: string): DomainError {
    return new DomainError({
      errorCode: "VET-INV-0003",
      message: "Lot bulunamadı",
      httpStatus: 404,
      severity: "warning",
      i18nKey: "error.VET-INV-0003",
      details: { id },
    });
  }

  private archivedCannotUpdateError(kind: string): DomainError {
    return new DomainError({
      errorCode: "VET-INV-0008",
      message: `Arşivlenmiş ${kind} güncellenemez`,
      httpStatus: 409,
      severity: "warning",
      i18nKey: "error.VET-INV-0008",
    });
  }

  private archivedCannotArchiveError(kind: string): DomainError {
    return new DomainError({
      errorCode: "VET-INV-0007",
      message: `${kind} zaten arşivlenmiş`,
      httpStatus: 409,
      severity: "warning",
      i18nKey: "error.VET-INV-0007",
    });
  }
}
