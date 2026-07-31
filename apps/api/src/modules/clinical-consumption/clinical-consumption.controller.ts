/**
 * @file ClinicalConsumption (klinik tüketim) controller.
 * @module apps/api/modules/clinical-consumption/clinical-consumption.controller
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü REST API. Muayene/aşı/ameliyat/yatış sırasında kullanılan
 * ürünlerin klinik tüketim kaydı olarak tutulmasını ve stoktan
 * otomatik düşülmesini sağlar.
 *
 * Endpoint'ler:
 * - `POST  /api/v1/inventory/clinical-consumptions`           — Tüketim kaydı oluştur
 * - `GET   /api/v1/inventory/clinical-consumptions`           — Arama + pagination
 * - `GET   /api/v1/inventory/clinical-consumptions/:id`       — Detay
 * - `POST  /api/v1/inventory/clinical-consumptions/:id/cancel` — İptal (ters kayıt)
 *
 * Sistem akışları (reçete dispense, aşı uygulaması, ameliyat
 * notu, yatış order) bu endpoint'i çağırmaz; doğrudan
 * `ClinicalConsumptionService.recordFor*` üzerinden kayıt oluşturur.
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  clinicalConsumptionCancelInputSchema,
  clinicalConsumptionCreateInputSchema,
  clinicalConsumptionFiltersSchema,
  type ClinicalConsumption,
  type ClinicalConsumptionCancelInput,
  type ClinicalConsumptionCreateInput,
  type ClinicalConsumptionFilters,
  type ClinicalConsumptionListResponse,
} from "@vetniva/contracts";

import { ClinicalConsumptionService } from "./clinical-consumption.service.js";

@ApiTags("inventory")
@UseGuards(PermissionsGuard)
@Controller("api/v1/inventory/clinical-consumptions")
export class ClinicalConsumptionController {
  public constructor(
    private readonly service: ClinicalConsumptionService,
  ) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  @Post()
  @RequirePermissions("inventory:clinical_consumption:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "clinicalConsumptionCreate",
    summary: "Klinik tüketim kaydı oluştur",
    description:
      "Muayene/aşı/ameliyat/yatış sırasında kullanılan ürünlerin " +
      "klinik tüketim kaydını oluşturur ve stoktan otomatik düşer. " +
      "Vaccination context'inde her satır için lot zorunlu.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Ürün/lot bulunamadı." })
  @ApiResponse({ status: 409, description: "Arşivli kayıt." })
  @ApiResponse({ status: 422, description: "Geçersiz veri / neden eksik." })
  public async create(
    @Body(new ZodValidationPipe(clinicalConsumptionCreateInputSchema))
    body: ClinicalConsumptionCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalConsumption> {
    const tenantId = this.requireTenant(actor);
    return this.service.create(tenantId, body, actor);
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  @Get()
  @RequirePermissions("inventory:clinical_consumption:read")
  @ApiOperation({
    operationId: "clinicalConsumptionList",
    summary: "Klinik tüketim kayıtlarını ara",
    description:
      "Tenant-scoped arama; context/contextRefId/patientId/status " +
      "ve tarih aralığı filtreleri + pagination.",
  })
  @ApiResponse({ status: 200, description: "Liste getirildi." })
  public async list(
    @Query(new ZodValidationPipe(clinicalConsumptionFiltersSchema))
    query: ClinicalConsumptionFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalConsumptionListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  @Get(":id")
  @RequirePermissions("inventory:clinical_consumption:read")
  @ApiOperation({
    operationId: "clinicalConsumptionGetById",
    summary: "Klinik tüketim kaydı detayı",
  })
  @ApiResponse({ status: 200, description: "Detay getirildi." })
  @ApiResponse({ status: 404, description: "Kayıt bulunamadı." })
  public async getById(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalConsumption> {
    const tenantId = this.requireTenant(actor);
    const rec = await this.service.getById(tenantId, id, actor);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-CLINICAL_CONSUMPTION-0001",
        message: "Klinik tüketim kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINICAL_CONSUMPTION-0001",
        details: { id },
      });
    }
    return rec;
  }

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  @Post(":id/cancel")
  @RequirePermissions("inventory:clinical_consumption:cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "clinicalConsumptionCancel",
    summary: "Klinik tüketim kaydını iptal et",
    description:
      "Tüketim kaydını iptal eder; her satır için ters kayıt " +
      "(reversal) oluşturularak stok bakiyesi geri getirilir. " +
      "cancelReason zorunlu.",
  })
  @ApiResponse({ status: 200, description: "İptal edildi." })
  @ApiResponse({ status: 404, description: "Kayıt bulunamadı." })
  @ApiResponse({ status: 409, description: "Zaten iptal edilmiş." })
  @ApiResponse({ status: 422, description: "İptal nedeni eksik." })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(clinicalConsumptionCancelInputSchema))
    body: ClinicalConsumptionCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalConsumption> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancel(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireTenant(actor: ActorContext): string {
    if (!actor.tenantId) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0001",
        message: "Tenant bağlamı zorunlu",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTHZ-0001",
      });
    }
    return actor.tenantId;
  }
}
