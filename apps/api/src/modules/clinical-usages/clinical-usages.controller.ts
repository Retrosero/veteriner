/**
 * @file ClinicalUsage (klinik tüketim) controller.
 * @module apps/api/modules/clinical-usages/clinical-usages.controller
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü REST API.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/usages`            — Yeni tüketim kaydı
 * - `GET    /api/v1/clinic/usages`            — Arama
 * - `GET    /api/v1/clinic/usages/:id`        — Detay.
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
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
  clinicalUsageCreateInputSchema,
  clinicalUsageFiltersSchema,
  type ClinicalUsageCreateInput,
  type ClinicalUsageDetail,
  type ClinicalUsageFilters,
  type ClinicalUsageListResponse,
} from "@vetniva/contracts";

import { ClinicalUsagesService } from "./clinical-usages.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/usages")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/usages")
export class ClinicalUsagesController {
  public constructor(private readonly service: ClinicalUsagesService) {}

  @Post()
  @RequirePermissions("clinic:stock:decrement")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "clinicalUsageRecord",
    summary: "Klinik tüketim kaydı",
    description:
      "Muayene/aşı/ameliyat/yatış/reçete akışlarından ürün tüketimi. " +
      "Her satır için purchaseTracked=true ürünlerde `clinical_use` " +
      "stok hareketi oluşturulur. `idempotencyKey` opsiyonel; aynı " +
      "key ile 2. çağrıda mevcut kayıt döner (farklı body → 409 " +
      "VET-CLINICAL-USE-0005).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(clinicalUsageCreateInputSchema))
    body: ClinicalUsageCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalUsageDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.recordUsage(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:stock:read")
  @ApiOperation({
    operationId: "clinicalUsageList",
    summary: "Klinik tüketim arama",
    description: "Tenant-scoped arama. sourceType/sourceId/sort filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(clinicalUsageFiltersSchema))
    query: ClinicalUsageFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalUsageListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listUsages(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:stock:read")
  @ApiOperation({
    operationId: "clinicalUsageGetById",
    summary: "Klinik tüketim detayı",
    description: "Header + satırlar. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalUsageDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getUsageDetail(tenantId, id, actor);
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-CLINICAL-USE-0001",
        message: "Tüketim kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINICAL-USE-0001",
      });
    }
    return detail;
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
