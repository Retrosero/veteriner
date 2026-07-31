/**
 * @file Inventory (depo/raf/lot) controller.
 * @module apps/api/modules/inventory/inventory.controller
 *
 * @description GOAL-061 (FAZ-6) depo, raf, lot ve SKT REST API.
 * Üç kaynak (warehouse, shelf, lot) için CRUD + arşivleme
 * endpoint'leri. Tenant ID URL'de taşınmaz; actor.tenantId'den
 * alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 *
 * Depo (Warehouse):
 * - `POST   /api/v1/inventory/warehouses`            — Yeni depo
 * - `GET    /api/v1/inventory/warehouses`            — Arama + pagination
 * - `GET    /api/v1/inventory/warehouses/:id`        — Detay
 * - `PATCH  /api/v1/inventory/warehouses/:id`        — Kısmi güncelleme
 * - `POST   /api/v1/inventory/warehouses/:id/archive` — Soft delete
 *
 * Raf (Shelf):
 * - `POST   /api/v1/inventory/shelves`               — Yeni raf
 * - `GET    /api/v1/inventory/shelves`               — Arama + pagination
 * - `GET    /api/v1/inventory/shelves/:id`           — Detay
 * - `PATCH  /api/v1/inventory/shelves/:id`           — Kısmi güncelleme
 * - `POST   /api/v1/inventory/shelves/:id/archive`   — Soft delete
 *
 * Lot (StockLot):
 * - `POST   /api/v1/inventory/lots`                  — Yeni lot
 * - `GET    /api/v1/inventory/lots`                  — Arama + pagination
 * - `GET    /api/v1/inventory/lots/:id`              — Detay
 * - `PATCH  /api/v1/inventory/lots/:id`              — Kısmi güncelleme
 * - `POST   /api/v1/inventory/lots/:id/archive`      — Soft delete
 *
 * @since GOAL-061 (FAZ-6) depo, raf, lot ve SKT core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  shelfArchiveInputSchema,
  shelfCreateInputSchema,
  shelfFiltersSchema,
  shelfUpdateInputSchema,
  stockLotArchiveInputSchema,
  stockLotCreateInputSchema,
  stockLotFiltersSchema,
  stockLotUpdateInputSchema,
  warehouseArchiveInputSchema,
  warehouseCreateInputSchema,
  warehouseFiltersSchema,
  warehouseUpdateInputSchema,
  type Shelf,
  type ShelfArchiveInput,
  type ShelfCreateInput,
  type ShelfFilters,
  type ShelfListResponse,
  type ShelfUpdateInput,
  type StockLot,
  type StockLotArchiveInput,
  type StockLotCreateInput,
  type StockLotFilters,
  type StockLotListResponse,
  type StockLotUpdateInput,
  type Warehouse,
  type WarehouseArchiveInput,
  type WarehouseCreateInput,
  type WarehouseFilters,
  type WarehouseListResponse,
  type WarehouseUpdateInput,
} from "@vetniva/contracts";

import { InventoryService } from "./inventory.service.js";

/**
 * Base controller — tek controller'da üç kaynak yönetilir
 * (path prefix ile). Daha küçük controller'lara bölmek
 * ileride yapılabilir.
 */
@ApiTags("inventory")
@UseGuards(PermissionsGuard)
@Controller("api/v1/inventory")
export class InventoryController {
  public constructor(private readonly service: InventoryService) {}

  // -------------------------------------------------------------------------
  // Warehouse endpoints
  // -------------------------------------------------------------------------

  @Post("warehouses")
  @RequirePermissions("inventory:warehouse:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "warehouseCreate",
    summary: "Yeni depo",
    description:
      "Tenant-scoped yeni depo oluşturur. `code` tenant-içi " +
      "benzersiz olmalıdır.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 409, description: "Duplicate code." })
  public async createWarehouse(
    @Body(new ZodValidationPipe(warehouseCreateInputSchema))
    body: WarehouseCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Warehouse> {
    const tenantId = this.requireTenant(actor);
    return this.service.createWarehouse(tenantId, body, actor);
  }

  @Get("warehouses")
  @RequirePermissions("inventory:warehouse:read")
  @ApiOperation({
    operationId: "warehouseList",
    summary: "Depo arama",
    description: "Tenant-scoped arama; arşivlenmişler dönmez.",
  })
  public async listWarehouses(
    @Query(new ZodValidationPipe(warehouseFiltersSchema))
    query: WarehouseFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<WarehouseListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listWarehouses(tenantId, query, actor);
  }

  @Get("warehouses/:id")
  @RequirePermissions("inventory:warehouse:read")
  @ApiOperation({
    operationId: "warehouseGetById",
    summary: "Depo detayı",
    description: "ID'ye göre depo getirir. Cross-tenant → 404.",
  })
  public async getWarehouse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Warehouse> {
    const tenantId = this.requireTenant(actor);
    const wh = await this.service.getWarehouse(tenantId, id, actor);
    if (!wh) {
      throw new DomainError({
        errorCode: "VET-INV-0001",
        message: "Depo bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-INV-0001",
      });
    }
    return wh;
  }

  @Patch("warehouses/:id")
  @RequirePermissions("inventory:warehouse:update")
  @ApiOperation({
    operationId: "warehouseUpdate",
    summary: "Depo kısmi güncelleme",
    description:
      "Yalnızca set edilen alanlar değişir. Arşivli → 409 " +
      "VET-INV-0009. `code` değişirse unique kontrolü.",
  })
  public async updateWarehouse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(warehouseUpdateInputSchema))
    body: WarehouseUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Warehouse> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateWarehouse(tenantId, id, body, actor);
  }

  @Post("warehouses/:id/archive")
  @RequirePermissions("inventory:warehouse:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "warehouseArchive",
    summary: "Depo arşivleme",
    description:
      "Soft delete. Aktif raf varsa 409 VET-INV-0002. " +
      "Geçmiş hareketler audit trail'de korunur.",
  })
  public async archiveWarehouse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(warehouseArchiveInputSchema))
    body: WarehouseArchiveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Warehouse> {
    const tenantId = this.requireTenant(actor);
    return this.service.archiveWarehouse(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------
  // Shelf endpoints
  // -------------------------------------------------------------------------

  @Post("shelves")
  @RequirePermissions("inventory:shelf:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "shelfCreate",
    summary: "Yeni raf",
    description:
      "Belirli bir depoya yeni raf ekler. `code` verildiyse " +
      "depo-içi benzersiz olmalıdır.",
  })
  public async createShelf(
    @Body(new ZodValidationPipe(shelfCreateInputSchema))
    body: ShelfCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Shelf> {
    const tenantId = this.requireTenant(actor);
    return this.service.createShelf(tenantId, body, actor);
  }

  @Get("shelves")
  @RequirePermissions("inventory:shelf:read")
  @ApiOperation({
    operationId: "shelfList",
    summary: "Raf arama",
    description:
      "Tenant-scoped arama; warehouseId filtresi. Arşivlenmişler dönmez.",
  })
  public async listShelves(
    @Query(new ZodValidationPipe(shelfFiltersSchema))
    query: ShelfFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ShelfListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listShelves(tenantId, query, actor);
  }

  @Get("shelves/:id")
  @RequirePermissions("inventory:shelf:read")
  @ApiOperation({
    operationId: "shelfGetById",
    summary: "Raf detayı",
  })
  public async getShelf(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Shelf> {
    const tenantId = this.requireTenant(actor);
    const shelf = await this.service.getShelf(tenantId, id, actor);
    if (!shelf) {
      throw new DomainError({
        errorCode: "VET-INV-0002",
        message: "Raf bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-INV-0002",
      });
    }
    return shelf;
  }

  @Patch("shelves/:id")
  @RequirePermissions("inventory:shelf:update")
  @ApiOperation({
    operationId: "shelfUpdate",
    summary: "Raf kısmi güncelleme",
  })
  public async updateShelf(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(shelfUpdateInputSchema))
    body: ShelfUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Shelf> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateShelf(tenantId, id, body, actor);
  }

  @Post("shelves/:id/archive")
  @RequirePermissions("inventory:shelf:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "shelfArchive",
    summary: "Raf arşivleme",
    description:
      "Soft delete. Aktif lot varsa 409 VET-INV-0003.",
  })
  public async archiveShelf(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(shelfArchiveInputSchema))
    body: ShelfArchiveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Shelf> {
    const tenantId = this.requireTenant(actor);
    return this.service.archiveShelf(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------
  // StockLot endpoints
  // -------------------------------------------------------------------------

  @Post("lots")
  @RequirePermissions("inventory:lot:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "stockLotCreate",
    summary: "Yeni lot",
    description:
      "Yeni lot/parti. `lotNumber` productId bazında " +
      "benzersiz; SKT geçmiş olamaz (422 VET-INV-0008).",
  })
  public async createLot(
    @Body(new ZodValidationPipe(stockLotCreateInputSchema))
    body: StockLotCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockLot> {
    const tenantId = this.requireTenant(actor);
    return this.service.createLot(tenantId, body, actor);
  }

  @Get("lots")
  @RequirePermissions("inventory:lot:read")
  @ApiOperation({
    operationId: "stockLotList",
    summary: "Lot arama",
    description:
      "Tenant-scoped arama; productId/shelfId/warehouseId/" +
      "expiredOnly/supplierName/lotNumber filtresi. SKT'ye göre " +
      "sıralanır (yaklaşan en önce).",
  })
  public async listLots(
    @Query(new ZodValidationPipe(stockLotFiltersSchema))
    query: StockLotFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockLotListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listLots(tenantId, query, actor);
  }

  @Get("lots/:id")
  @RequirePermissions("inventory:lot:read")
  @ApiOperation({
    operationId: "stockLotGetById",
    summary: "Lot detayı",
  })
  public async getLot(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockLot> {
    const tenantId = this.requireTenant(actor);
    const lot = await this.service.getLot(tenantId, id, actor);
    if (!lot) {
      throw new DomainError({
        errorCode: "VET-INV-0003",
        message: "Lot bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-INV-0003",
      });
    }
    return lot;
  }

  @Patch("lots/:id")
  @RequirePermissions("inventory:lot:update")
  @ApiOperation({
    operationId: "stockLotUpdate",
    summary: "Lot kısmi güncelleme",
  })
  public async updateLot(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(stockLotUpdateInputSchema))
    body: StockLotUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockLot> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateLot(tenantId, id, body, actor);
  }

  @Post("lots/:id/archive")
  @RequirePermissions("inventory:lot:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "stockLotArchive",
    summary: "Lot arşivleme",
  })
  public async archiveLot(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(stockLotArchiveInputSchema))
    body: StockLotArchiveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockLot> {
    const tenantId = this.requireTenant(actor);
    return this.service.archiveLot(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------

  private requireTenant(actor: ActorContext): string {
    if (actor.tenantId) return actor.tenantId;
    throw new DomainError({
      errorCode: "VET-TENANT-0001",
      message: "Tenant bağlamı zorunlu",
      httpStatus: 400,
      severity: "warning",
      i18nKey: "error.VET-TENANT-0001",
    });
  }
}
