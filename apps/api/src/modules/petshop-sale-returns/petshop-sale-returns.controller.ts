/**
 * @file PetshopSaleReturn (sale return) controller.
 * @module apps/api/modules/petshop-sale-returns/petshop-sale-returns.controller
 *
 * @description GOAL-065 (FAZ-6) petshop satış iadesi REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır
 *   (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/petshop/sales/returns`                — Yeni taslak
 * - `GET    /api/v1/petshop/sales/returns`                — Arama
 * - `GET    /api/v1/petshop/sales/returns/:id`            — Detay
 * - `POST   /api/v1/petshop/sales/returns/:id/complete`   — Tamamla (stok iade)
 * - `POST   /api/v1/petshop/sales/returns/:id/cancel`     — İptal
 *
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  petshopSaleReturnCancelInputSchema,
  petshopSaleReturnCompleteInputSchema,
  petshopSaleReturnCreateInputSchema,
  petshopSaleReturnFiltersSchema,
  type PetshopSaleReturnCancelInput,
  type PetshopSaleReturnCompleteInput,
  type PetshopSaleReturnCreateInput,
  type PetshopSaleReturnDetail,
  type PetshopSaleReturnFilters,
  type PetshopSaleReturnListResponse,
} from "@vetniva/contracts";

import { PetshopSaleReturnsService } from "./petshop-sale-returns.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("petshop/sale-returns")
@UseGuards(PermissionsGuard)
@Controller("api/v1/petshop/sales/returns")
export class PetshopSaleReturnsController {
  public constructor(private readonly service: PetshopSaleReturnsService) {}

  @Post()
  @RequirePermissions("petshop:sale:refund")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "petshopSaleReturnCreate",
    summary: "Yeni petshop satış iadesi taslağı",
    description:
      "Yalnızca tamamlanmış satışlar iade edilebilir (422 " +
      "VET-RETURN-0002). İade satırları orijinal satırlara " +
      "`originalLineId` ile eşleşmeli (422 VET-RETURN-0004); iade " +
      "miktarı orijinal satış miktarını aşamaz (422 VET-RETURN-0003). " +
      "Lot belirtilen satırlarda lot mevcut, arşivsiz ve satır " +
      "ürünüyle eşleşiyor olmalı.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(petshopSaleReturnCreateInputSchema))
    body: PetshopSaleReturnCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.createReturn(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("petshop:sale:read")
  @ApiOperation({
    operationId: "petshopSaleReturnList",
    summary: "Petshop satış iadesi arama",
    description:
      "Tenant-scoped arama. status/originalSaleId/customerOwnerId/" +
      "customerPatientId/refundMethod/sort filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(petshopSaleReturnFiltersSchema))
    query: PetshopSaleReturnFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleReturnListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listReturns(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("petshop:sale:read")
  @ApiOperation({
    operationId: "petshopSaleReturnGetById",
    summary: "Petshop satış iadesi detayı",
    description: "Header + satırlar. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getReturnDetail(tenantId, id, actor);
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-RETURN-0001",
        message: "İade bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0001",
      });
    }
    return detail;
  }

  @Post(":id/complete")
  @RequirePermissions("petshop:sale:refund")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "petshopSaleReturnComplete",
    summary: "Petshop satış iadesi tamamlama",
    description:
      "draft → completed. Her satır için `return` stok hareketi " +
      "oluşturulur (purchaseTracked ürünler için, lot belirtildiyse " +
      "lotId ile bağlanır). Tamamlanmış iade yeniden tamamlanamaz " +
      "(409 VET-RETURN-0005).",
  })
  public async complete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(petshopSaleReturnCompleteInputSchema))
    body: PetshopSaleReturnCompleteInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.completeReturn(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("petshop:sale:refund")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "petshopSaleReturnCancel",
    summary: "Petshop satış iadesi iptali",
    description:
      "draft → cancelled. Zaten iptal edilmiş iadeler 409 " +
      "VET-RETURN-0005; tamamlanmış iadeler 409 VET-RETURN-0010 " +
      "(ayrı ters kayıt gerekir). İptal nedeni zorunlu.",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(petshopSaleReturnCancelInputSchema))
    body: PetshopSaleReturnCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelReturn(tenantId, id, body, actor);
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
