/**
 * @file Lab order controller.
 * @module apps/api/modules/lab-orders/lab-orders.controller
 *
 * @description GOAL-091 (FAZ-9) laboratuvar isteği REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/lab-orders`                  — Yeni sipariş
 * - `GET    /api/v1/clinic/lab-orders`                  — Arama
 * - `GET    /api/v1/clinic/lab-orders/:id`              — Detay
 * - `POST   /api/v1/clinic/lab-orders/:id/collect`      — Numune al
 * - `POST   /api/v1/clinic/lab-orders/:id/start`        — İşleme al
 * - `POST   /api/v1/clinic/lab-orders/:id/complete`     — Tamamla
 * - `POST   /api/v1/clinic/lab-orders/:id/cancel`       — İptal
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
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

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  labOrderCancelInputSchema,
  labOrderCollectSampleInputSchema,
  labOrderCompleteInputSchema,
  labOrderCreateInputSchema,
  labOrderFiltersSchema,
  labOrderStartProcessingInputSchema,
  type LabOrder,
  type LabOrderCancelInput,
  type LabOrderCollectSampleInput,
  type LabOrderCompleteInput,
  type LabOrderCreateInput,
  type LabOrderFilters,
  type LabOrderListResponse,
  type LabOrderStartProcessingInput,
} from "@vetniva/contracts";

import { LabOrdersService } from "./lab-orders.service.js";

@ApiTags("clinic/lab-orders")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/lab-orders")
export class LabOrdersController {
  public constructor(
    private readonly service: LabOrdersService,
  ) {}

  @Post()
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "labOrderCreate",
    summary: "Yeni laboratuvar isteği",
    description:
      "Katalogdan labTestId ile snapshot alır. Pasif katalog " +
      "reddedilir (422 VET-LABORD-0004).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(labOrderCreateInputSchema))
    body: LabOrderCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.createLabOrder(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labOrderList",
    summary: "Laboratuvar isteği arama",
    description:
      "Tenant-scoped. status/patientId/sourceType/sourceId/" +
      "dateFrom/dateTo filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(labOrderFiltersSchema))
    query: LabOrderFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabOrderListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listLabOrders(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labOrderGetById",
    summary: "Laboratuvar isteği detayı",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabOrder> {
    const tenantId = this.requireTenant(actor);
    const o = await this.service.getLabOrderDetail(tenantId, id, actor);
    if (!o) {
      throw new DomainError({
        errorCode: "VET-LABORD-0001",
        message: "Laboratuvar isteği bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABORD-0001",
      });
    }
    return o;
  }

  @Post(":id/collect")
  @RequirePermissions("clinic:lab:collect_sample")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labOrderCollect",
    summary: "Numune alımı",
    description:
      "ordered → collected. Yanlış durum 409 VET-LABORD-0002.",
  })
  public async collect(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(labOrderCollectSampleInputSchema))
    body: LabOrderCollectSampleInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.collectSample(tenantId, id, body, actor);
  }

  @Post(":id/start")
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labOrderStart",
    summary: "İşleme alma (laboratuvara gönder)",
    description: "collected → processing.",
  })
  public async start(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(labOrderStartProcessingInputSchema))
    body: LabOrderStartProcessingInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.startProcessing(tenantId, id, body, actor);
  }

  @Post(":id/complete")
  @RequirePermissions("clinic:lab:enter_result")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labOrderComplete",
    summary: "İsteği tamamla (henüz sonuç yok)",
    description:
      "processing → completed. Sonuç değerleri GOAL-092 ile girilecek.",
  })
  public async complete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(labOrderCompleteInputSchema))
    body: LabOrderCompleteInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.completeLabOrder(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labOrderCancel",
    summary: "İsteği iptal",
    description:
      "ordered | collected → cancelled. processing/completed/cancelled " +
      "→ 409 VET-LABORD-0002.",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(labOrderCancelInputSchema))
    body: LabOrderCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelLabOrder(tenantId, id, body, actor);
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
