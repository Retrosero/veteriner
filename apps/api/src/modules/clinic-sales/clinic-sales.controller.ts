/**
 * @file ClinicSale (klinik satış taslağı) controller.
 * @module apps/api/modules/clinic-sales/clinic-sales.controller
 *
 * @description GOAL-071 (FAZ-7) klinik satış taslağı REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/sales`                 — Yeni taslak
 * - `GET    /api/v1/clinic/sales`                 — Arama
 * - `GET    /api/v1/clinic/sales/:id`             — Detay
 * - `PATCH  /api/v1/clinic/sales/:id`             — Taslak düzenle
 * - `POST   /api/v1/clinic/sales/:id/complete`    — Tamamla
 * - `POST   /api/v1/clinic/sales/:id/cancel`      — İptal
 *
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
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
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  clinicSaleCancelInputSchema,
  clinicSaleCreateInputSchema,
  clinicSaleFiltersSchema,
  clinicSaleUpdateInputSchema,
  type ClinicSaleCancelInput,
  type ClinicSaleCreateInput,
  type ClinicSaleDetail,
  type ClinicSaleFilters,
  type ClinicSaleListResponse,
  type ClinicSaleUpdateInput,
} from "@vetniva/contracts";

import { ClinicSalesService } from "./clinic-sales.service.js";

@ApiTags("clinic/sales")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/sales")
export class ClinicSalesController {
  public constructor(
    private readonly service: ClinicSalesService,
  ) {}

  @Post()
  @RequirePermissions("clinic:payment:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "clinicSaleCreate",
    summary: "Yeni klinik satış taslağı",
    description:
      "Muayene/aşı/lab_order/imaging_order kaynağından otomatik " +
      "taslak. customerOwnerId + customerPatientId zorunlu. " +
      "İndirim yetkisi: STAFF/VETERINARIAN max %10, OWNER sınırsız.",
  })
  public async create(
    @Body(new ZodValidationPipe(clinicSaleCreateInputSchema))
    body: ClinicSaleCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.createClinicSale(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "clinicSaleList",
    summary: "Klinik satış arama",
    description:
      "Tenant-scoped arama. status/customerOwnerId/customerPatientId/" +
      "sourceType/sourceId/sort filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(clinicSaleFiltersSchema))
    query: ClinicSaleFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicSaleListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listClinicSales(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "clinicSaleGetById",
    summary: "Klinik satış detayı",
    description: "Header + satırlar. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getClinicSaleDetail(tenantId, id, actor);
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC_SALE-0001",
      });
    }
    return detail;
  }

  @Patch(":id")
  @RequirePermissions("clinic:payment:create")
  @ApiOperation({
    operationId: "clinicSaleUpdate",
    summary: "Taslak klinik satış düzenleme",
    description:
      "Yalnızca `draft` durumdaki klinik satışlar düzenlenebilir. " +
      "Tamamlanmış/iptal edilmiş 409 VET-CLINIC_SALE-0003.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(clinicSaleUpdateInputSchema))
    body: ClinicSaleUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateClinicSale(tenantId, id, body, actor);
  }

  @Post(":id/complete")
  @RequirePermissions("clinic:payment:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "clinicSaleComplete",
    summary: "Klinik satış tamamlama",
    description:
      "draft → completed. Tahsilat (GOAL-072+) bu aşamadan " +
      "sonra ayrı bir akışla bağlanır.",
  })
  public async complete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.completeClinicSale(tenantId, id, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("clinic:payment:reverse")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "clinicSaleCancel",
    summary: "Klinik satış iptali",
    description:
      "draft/completed → cancelled. Tamamlanmış klinik satış " +
      "iptal edilirse tahsilat reversal (GOAL-073) ayrıca yapılır.",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(clinicSaleCancelInputSchema))
    body: ClinicSaleCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelClinicSale(tenantId, id, body, actor);
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
