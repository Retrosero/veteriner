/**
 * @file Imaging order controller.
 * @module apps/api/modules/imaging-orders/imaging-orders.controller
 *
 * @description GOAL-093 (FAZ-9) görüntüleme isteği REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/imaging-orders`                  — Yeni sipariş
 * - `GET    /api/v1/clinic/imaging-orders`                  — Arama
 * - `GET    /api/v1/clinic/imaging-orders/:id`              — Detay
 * - `POST   /api/v1/clinic/imaging-orders/:id/schedule`     — Planlama
 * - `POST   /api/v1/clinic/imaging-orders/:id/perform`      — Çekim
 * - `POST   /api/v1/clinic/imaging-orders/:id/report`       — Rapor yaz
 * - `POST   /api/v1/clinic/imaging-orders/:id/approve-report` — Rapor onayı
 * - `POST   /api/v1/clinic/imaging-orders/:id/amend-report`   — Rapor düzeltme
 * - `POST   /api/v1/clinic/imaging-orders/:id/complete`     — Tamamla
 * - `POST   /api/v1/clinic/imaging-orders/:id/cancel`       — İptal
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
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
  imagingOrderAmendReportInputSchema,
  imagingOrderApproveReportInputSchema,
  imagingOrderCancelInputSchema,
  imagingOrderCompleteInputSchema,
  imagingOrderCreateInputSchema,
  imagingOrderFiltersSchema,
  imagingOrderPerformInputSchema,
  imagingOrderReportInputSchema,
  imagingOrderScheduleInputSchema,
  type ImagingOrder,
  type ImagingOrderAmendReportInput,
  type ImagingOrderApproveReportInput,
  type ImagingOrderCancelInput,
  type ImagingOrderCompleteInput,
  type ImagingOrderCreateInput,
  type ImagingOrderFilters,
  type ImagingOrderListResponse,
  type ImagingOrderPerformInput,
  type ImagingOrderReportInput,
  type ImagingOrderScheduleInput,
} from "@vetniva/contracts";

import { ImagingOrdersService } from "./imaging-orders.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/imaging-orders")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/imaging-orders")
export class ImagingOrdersController {
  public constructor(private readonly service: ImagingOrdersService) {}

  @Post()
  @RequirePermissions("clinic:imaging:order")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "imagingOrderCreate",
    summary: "Yeni görüntüleme isteği",
    description:
      "Katalogdan imagingTestId ile snapshot alır. Pasif katalog " +
      "reddedilir (422 VET-IMG-0004).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(imagingOrderCreateInputSchema))
    body: ImagingOrderCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.createImagingOrder(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:imaging:read")
  @ApiOperation({
    operationId: "imagingOrderList",
    summary: "Görüntüleme isteği arama",
    description:
      "Tenant-scoped. status/modality/patientId/sourceType/sourceId/" +
      "dateFrom/dateTo filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(imagingOrderFiltersSchema))
    query: ImagingOrderFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrderListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listImagingOrders(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:imaging:read")
  @ApiOperation({
    operationId: "imagingOrderGetById",
    summary: "Görüntüleme isteği detayı",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    const o = await this.service.getImagingOrderDetail(tenantId, id, actor);
    if (!o) {
      throw new DomainError({
        errorCode: "VET-IMG-0001",
        message: "Görüntüleme isteği bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-IMG-0001",
      });
    }
    return o;
  }

  @Post(":id/schedule")
  @RequirePermissions("clinic:imaging:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "imagingOrderSchedule",
    summary: "Planlama",
    description: "ordered → scheduled.",
  })
  public async schedule(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(imagingOrderScheduleInputSchema))
    body: ImagingOrderScheduleInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.scheduleImagingOrder(tenantId, id, body, actor);
  }

  @Post(":id/perform")
  @RequirePermissions("clinic:imaging:perform")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "imagingOrderPerform",
    summary: "Çekim",
    description:
      "scheduled → performed. Çekim dosyaları (attachments) bu adımda eklenir.",
  })
  public async perform(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(imagingOrderPerformInputSchema))
    body: ImagingOrderPerformInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.performImagingOrder(tenantId, id, body, actor);
  }

  @Post(":id/report")
  @RequirePermissions("clinic:imaging:report")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "imagingOrderReport",
    summary: "Rapor yaz (ilk revision)",
    description:
      "performed → reported. findings + impression zorunlu; " +
      "recommendation + attachments opsiyonel.",
  })
  public async report(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(imagingOrderReportInputSchema))
    body: ImagingOrderReportInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.reportImagingOrder(tenantId, id, body, actor);
  }

  @Post(":id/approve-report")
  @RequirePermissions("clinic:imaging:report")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "imagingOrderApproveReport",
    summary: "Rapor onayı",
    description:
      "reported/amended → reported (approved). Onaylanmış rapor " +
      "değiştirilemez; düzeltme için amend kullanın.",
  })
  public async approveReport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(imagingOrderApproveReportInputSchema))
    body: ImagingOrderApproveReportInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.approveReport(tenantId, id, body, actor);
  }

  @Post(":id/amend-report")
  @RequirePermissions("clinic:imaging:report")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "imagingOrderAmendReport",
    summary: "Rapor düzeltme (amendment)",
    description:
      "reported/amended → amended. Yeni revision oluşur. reason zorunlu.",
  })
  public async amendReport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(imagingOrderAmendReportInputSchema))
    body: ImagingOrderAmendReportInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.amendReport(tenantId, id, body, actor);
  }

  @Post(":id/complete")
  @RequirePermissions("clinic:imaging:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "imagingOrderComplete",
    summary: "Siparişi tamamla",
    description: "reported/amended → completed.",
  })
  public async complete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(imagingOrderCompleteInputSchema))
    body: ImagingOrderCompleteInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.completeImagingOrder(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("clinic:imaging:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "imagingOrderCancel",
    summary: "Siparişi iptal",
    description:
      "ordered | scheduled → cancelled. Diğer durumlar 409 VET-IMG-0002.",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(imagingOrderCancelInputSchema))
    body: ImagingOrderCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ImagingOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelImagingOrder(tenantId, id, body, actor);
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
