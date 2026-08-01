/**
 * @file Supplier (tedarikçi) controller.
 * @module apps/api/modules/suppliers/suppliers.controller
 *
 * @description GOAL-062 (FAZ-6) tedarikçi kataloğu REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır
 *   (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/catalog/suppliers`           — Yeni tedarikçi
 * - `GET    /api/v1/catalog/suppliers`           — Arama + pagination
 * - `GET    /api/v1/catalog/suppliers/:id`       — Detay
 * - `PATCH  /api/v1/catalog/suppliers/:id`       — Kısmi güncelleme
 * - `POST   /api/v1/catalog/suppliers/:id/archive` — Soft delete
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
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
import {
  supplierArchiveInputSchema,
  supplierCreateInputSchema,
  supplierFiltersSchema,
  supplierUpdateInputSchema,
  type Supplier,
  type SupplierArchiveInput,
  type SupplierCreateInput,
  type SupplierFilters,
  type SupplierListResponse,
  type SupplierUpdateInput,
} from "@vetniva/contracts";

import { SuppliersService } from "./suppliers.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("catalog/suppliers")
@UseGuards(PermissionsGuard)
@Controller("api/v1/catalog/suppliers")
export class SuppliersController {
  public constructor(private readonly service: SuppliersService) {}

  @Post()
  @RequirePermissions("catalog:supplier:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "supplierCreate",
    summary: "Yeni tedarikçi",
    description:
      "Tedarikçi kataloğuna yeni kayıt ekler. Code tenant içinde " +
      "benzersizdir; duplicate → 409 VET-SUPPLIER-0002.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 409, description: "Duplicate code." })
  public async create(
    @Body(new ZodValidationPipe(supplierCreateInputSchema))
    body: SupplierCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Supplier> {
    const tenantId = this.requireTenant(actor);
    return this.service.createSupplier(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("catalog:supplier:read")
  @ApiOperation({
    operationId: "supplierList",
    summary: "Tedarikçi arama",
    description:
      "Tenant-scoped arama. type/active/search filtreleri; " +
      "arşivlenmiş kayıtlar dönmez.",
  })
  public async list(
    @Query(new ZodValidationPipe(supplierFiltersSchema))
    query: SupplierFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<SupplierListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listSuppliers(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("catalog:supplier:read")
  @ApiOperation({
    operationId: "supplierGetById",
    summary: "Tedarikçi detayı",
    description: "ID'ye göre tedarikçi getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Supplier> {
    const tenantId = this.requireTenant(actor);
    const supplier = await this.service.getSupplier(tenantId, id, actor);
    if (!supplier) {
      throw new DomainError({
        errorCode: "VET-SUPPLIER-0001",
        message: "Tedarikçi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SUPPLIER-0001",
      });
    }
    return supplier;
  }

  @Patch(":id")
  @RequirePermissions("catalog:supplier:update")
  @ApiOperation({
    operationId: "supplierUpdate",
    summary: "Tedarikçi kısmi güncelleme",
    description:
      "Yalnızca set edilen alanlar değişir. Arşivli kayıt " +
      "güncellenemez (409 VET-SUPPLIER-0004). Code değişirse " +
      "unique kontrolü yapılır.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(supplierUpdateInputSchema))
    body: SupplierUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Supplier> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateSupplier(tenantId, id, body, actor);
  }

  @Post(":id/archive")
  @RequirePermissions("catalog:supplier:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "supplierArchive",
    summary: "Tedarikçi arşivleme",
    description:
      "Soft delete: archivedAt set edilir. Geçmiş satın alma " +
      "siparişleri audit trail'de korunur.",
  })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(supplierArchiveInputSchema))
    body: SupplierArchiveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Supplier> {
    const tenantId = this.requireTenant(actor);
    return this.service.archiveSupplier(tenantId, id, body, actor);
  }

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
