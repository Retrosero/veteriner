/**
 * @file HospitalizationOrder controller.
 * @module apps/api/modules/hospitalization-orders/hospitalization-orders.controller
 *
 * @description GOAL-085 (FAZ-8) yatış order REST API. Tenant ID
 *   URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST  /api/v1/clinic/hospitalization-orders`              — Yeni order
 * - `GET   /api/v1/clinic/hospitalization-orders`              — Arama
 * - `GET   /api/v1/clinic/hospitalization-orders/:id`          — Detay + schedules
 * - `PATCH /api/v1/clinic/hospitalization-orders/:id`          — Güncelle (active)
 * - `POST  /api/v1/clinic/hospitalization-orders/:id/cancel`   — İptal
 * - `POST  /api/v1/clinic/hospitalization-orders/:id/schedules` — Schedule ekle
 * - `GET   /api/v1/clinic/hospitalization-orders/schedules`     — Schedule arama
 * - `POST  /api/v1/clinic/hospitalization-orders/schedules/:scheduleId/apply` — Apply
 * - `POST  /api/v1/clinic/hospitalization-orders/schedules/:scheduleId/skip`  — Skip
 *
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  hospitalizationOrderApplyInputSchema,
  hospitalizationOrderCancelInputSchema,
  hospitalizationOrderCreateInputSchema,
  hospitalizationOrderFiltersSchema,
  hospitalizationOrderScheduleCreateInputSchema,
  hospitalizationOrderScheduleFiltersSchema,
  hospitalizationOrderSkipInputSchema,
  hospitalizationOrderUpdateInputSchema,
  type HospitalizationOrder,
  type HospitalizationOrderApplyInput,
  type HospitalizationOrderCancelInput,
  type HospitalizationOrderCreateInput,
  type HospitalizationOrderDetail,
  type HospitalizationOrderFilters,
  type HospitalizationOrderListResponse,
  type HospitalizationOrderSchedule,
  type HospitalizationOrderScheduleCreateInput,
  type HospitalizationOrderScheduleFilters,
  type HospitalizationOrderScheduleListResponse,
  type HospitalizationOrderSkipInput,
  type HospitalizationOrderUpdateInput,
} from "@vetniva/contracts";

import { HospitalizationOrdersService } from "./hospitalization-orders.service.js";

@ApiTags("clinic/hospitalization-orders")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/hospitalization-orders")
export class HospitalizationOrdersController {
  public constructor(
    private readonly service: HospitalizationOrdersService,
  ) {}

  @Post()
  @RequirePermissions("clinic:hospitalization:add_note")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "hospitalizationOrderCreate",
    summary: "Yeni yatış order",
    description:
      "Yatış discharged/cancelled değilse 422 VET-HORD-0003.",
  })
  public async createOrder(
    @Body(new ZodValidationPipe(hospitalizationOrderCreateInputSchema))
    body: HospitalizationOrderCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.createOrder(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "hospitalizationOrderList",
    summary: "Yatış order arama",
  })
  public async listOrders(
    @Query(new ZodValidationPipe(hospitalizationOrderFiltersSchema))
    query: HospitalizationOrderFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrderListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listOrders(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "hospitalizationOrderGetById",
    summary: "Yatış order detayı (schedules dahil)",
    description: "Cross-tenant → 404.",
  })
  public async getOrderDetail(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrderDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getOrderDetail(tenantId, id, actor);
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-HORD-0001",
        message: "Yatış order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HORD-0001",
      });
    }
    return detail;
  }

  @Patch(":id")
  @RequirePermissions("clinic:hospitalization:add_note")
  @ApiOperation({
    operationId: "hospitalizationOrderUpdate",
    summary: "Yatış order güncelleme (active)",
    description: "Active olmayan order düzenlenemez (409 VET-HORD-0004).",
  })
  public async updateOrder(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(hospitalizationOrderUpdateInputSchema))
    body: HospitalizationOrderUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateOrder(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("clinic:hospitalization:admit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "hospitalizationOrderCancel",
    summary: "Yatış order iptali (active → cancelled)",
    description:
      "Yalnızca active (409 VET-HORD-0005). endsAt set edilir.",
  })
  public async cancelOrder(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(hospitalizationOrderCancelInputSchema))
    body: HospitalizationOrderCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrder> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelOrder(tenantId, id, body, actor);
  }

  @Post(":id/schedules")
  @RequirePermissions("clinic:hospitalization:add_note")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "hospitalizationOrderScheduleAdd",
    summary: "Order'a schedule ekle",
    description: "Yalnızca active order (409 VET-HORD-0004).",
  })
  public async addSchedule(
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(hospitalizationOrderScheduleCreateInputSchema))
    body: HospitalizationOrderScheduleCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrderSchedule> {
    const tenantId = this.requireTenant(actor);
    return this.service.addSchedule(tenantId, orderId, body, actor);
  }

  @Get("schedules")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "hospitalizationOrderScheduleList",
    summary: "Schedule arama",
    description:
      "status filtresi: pending / applied / skipped / overdue. " +
      "overdue için asOf=ISO datetime (default now).",
  })
  public async listSchedules(
    @Query(new ZodValidationPipe(hospitalizationOrderScheduleFiltersSchema))
    query: HospitalizationOrderScheduleFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrderScheduleListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listSchedules(tenantId, query, actor);
  }

  @Post("schedules/:scheduleId/apply")
  @RequirePermissions("clinic:hospitalization:add_note")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "hospitalizationOrderScheduleApply",
    summary: "Schedule uygulandı olarak işaretle",
    description:
      "Pending → applied. Zaten applied/skipped ise 409 VET-HORD-0007.",
  })
  public async applySchedule(
    @Param("scheduleId") scheduleId: string,
    @Body(new ZodValidationPipe(hospitalizationOrderApplyInputSchema))
    body: HospitalizationOrderApplyInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrderSchedule> {
    const tenantId = this.requireTenant(actor);
    return this.service.applySchedule(tenantId, scheduleId, body, actor);
  }

  @Post("schedules/:scheduleId/skip")
  @RequirePermissions("clinic:hospitalization:add_note")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "hospitalizationOrderScheduleSkip",
    summary: "Schedule skip (kaçırıldı) olarak işaretle",
    description:
      "Pending → skipped. Zaten applied/skipped ise 409 VET-HORD-0007.",
  })
  public async skipSchedule(
    @Param("scheduleId") scheduleId: string,
    @Body(new ZodValidationPipe(hospitalizationOrderSkipInputSchema))
    body: HospitalizationOrderSkipInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationOrderSchedule> {
    const tenantId = this.requireTenant(actor);
    return this.service.skipSchedule(tenantId, scheduleId, body, actor);
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
