/**
 * @file PetshopSale (POS) controller.
 * @module apps/api/modules/petshop-sales/petshop-sales.controller
 *
 * @description GOAL-064 (FAZ-6) petshop POS REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır
 *   (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/petshop/sales`                — Yeni taslak
 * - `GET    /api/v1/petshop/sales`                — Arama
 * - `GET    /api/v1/petshop/sales/:id`            — Detay
 * - `PATCH  /api/v1/petshop/sales/:id`            — Taslak düzenle
 * - `POST   /api/v1/petshop/sales/:id/complete`   — Tamamla (tahsilat + stok)
 * - `POST   /api/v1/petshop/sales/:id/cancel`     — İptal
 *
 * @since GOAL-064 (FAZ-6) petshop POS core
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
  petshopSaleCancelInputSchema,
  petshopSaleCompleteInputSchema,
  petshopSaleCreateInputSchema,
  petshopSaleFiltersSchema,
  petshopSaleUpdateInputSchema,
  type PetshopSaleCancelInput,
  type PetshopSaleCompleteInput,
  type PetshopSaleCreateInput,
  type PetshopSaleDetail,
  type PetshopSaleFilters,
  type PetshopSaleListResponse,
  type PetshopSaleUpdateInput,
} from "@vetniva/contracts";

import { PetshopSalesService } from "./petshop-sales.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("petshop/sales")
@UseGuards(PermissionsGuard)
@Controller("api/v1/petshop/sales")
export class PetshopSalesController {
  public constructor(private readonly service: PetshopSalesService) {}

  @Post()
  @RequirePermissions("petshop:sale:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "petshopSaleCreate",
    summary: "Yeni petshop satış taslağı",
    description:
      "Barkodlu hızlı satış için taslak. En az 1 satır zorunlu. " +
      "Ürün arşivliyse 422 VET-SALE-0006.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(petshopSaleCreateInputSchema))
    body: PetshopSaleCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.createSale(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("petshop:sale:read")
  @ApiOperation({
    operationId: "petshopSaleList",
    summary: "Petshop satış arama",
    description:
      "Tenant-scoped arama. status/customerOwnerId/customerPatientId/" +
      "paymentMethod/sort filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(petshopSaleFiltersSchema))
    query: PetshopSaleFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listSales(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("petshop:sale:read")
  @ApiOperation({
    operationId: "petshopSaleGetById",
    summary: "Petshop satış detayı",
    description: "Header + satırlar. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getSaleDetail(tenantId, id, actor);
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SALE-0001",
      });
    }
    return detail;
  }

  @Patch(":id")
  @RequirePermissions("petshop:sale:create")
  @ApiOperation({
    operationId: "petshopSaleUpdate",
    summary: "Taslak petshop satış düzenleme",
    description:
      "Yalnızca `draft` durumdaki satışlar düzenlenebilir. " +
      "Tamamlanmış/iptal edilmiş satışlar 409 VET-SALE-0003.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(petshopSaleUpdateInputSchema))
    body: PetshopSaleUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateSale(tenantId, id, body, actor);
  }

  @Post(":id/complete")
  @RequirePermissions("petshop:sale:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "petshopSaleComplete",
    summary: "Petshop satış tamamlama",
    description:
      "draft → completed. Her satır için `sale` stok hareketi " +
      "oluşturulur (purchaseTracked ürünler için). Ürün arşivliyse " +
      "422 VET-SALE-0006.",
  })
  public async complete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(petshopSaleCompleteInputSchema))
    body: PetshopSaleCompleteInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.completeSale(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("petshop:sale:refund")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "petshopSaleCancel",
    summary: "Petshop satış iptali",
    description:
      "draft/completed → cancelled. Tamamlanmış satışlarda her " +
      "satır için `reversal` stok hareketi oluşturulur. " +
      "Zaten iptal edilmişse 409 VET-SALE-0004. İptal nedeni zorunlu.",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(petshopSaleCancelInputSchema))
    body: PetshopSaleCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelSale(tenantId, id, body, actor);
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
