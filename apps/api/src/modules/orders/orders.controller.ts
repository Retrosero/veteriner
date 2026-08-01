/**
 * @file Orders (klinik order) controller.
 * @module apps/api/modules/orders/orders.controller
 *
 * @description GOAL-044 tedavi planı + klinik order REST API. Tenant
 * ID URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 * koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/examinations/:id/orders` — Yeni order oluştur
 * - `GET  /api/v1/clinic/orders`                  — Liste + filtre
 * - `POST /api/v1/clinic/orders/:id/start`        — Başlat
 * - `POST /api/v1/clinic/orders/:id/complete`     — Tamamla
 * - `POST /api/v1/clinic/orders/:id/cancel`       — İptal
 * - `GET  /api/v1/clinic/patients/:id/treatment-plan` — Tedavi planı
 *
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
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
import {
  orderCancelInputSchema,
  orderCreateInputSchema,
  orderFiltersSchema,
} from "@vetniva/contracts";

import { OrdersService } from "./orders.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Order,
  OrderCancelInput,
  OrderCreateInput,
  OrderFilters,
  OrderListResponse,
  OrderTreatmentPlan,
} from "@vetniva/contracts";

@ApiTags("orders")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class OrdersController {
  public constructor(private readonly service: OrdersService) {}

  // -------------------------------------------------------------------------
  // examinations/:id/orders — order oluştur
  // -------------------------------------------------------------------------

  @Post("examinations/:id/orders")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "orderCreate",
    summary: "Yeni klinik order oluştur",
    description:
      "Examination aynı tenant'ta mı kontrolünden sonra order oluşturur. " +
      "status='pending' olarak işaretlenir; patientId examination'dan " +
      "türetilir.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Examination bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz input." })
  public async create(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orderCreateInputSchema))
    body: OrderCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Order> {
    const tenantId = this.requireTenant(actor);
    return this.service.create(tenantId, { ...body, examinationId: id }, actor);
  }

  // -------------------------------------------------------------------------
  // orders — liste
  // -------------------------------------------------------------------------

  @Get("orders")
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "orderList",
    summary: "Order listesi",
    description:
      "patientId / type / status / from / to / limit / offset filtreleri " +
      "ile tenant-scoped arama.",
  })
  public async list(
    @Query(new ZodValidationPipe(orderFiltersSchema))
    query: OrderFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<OrderListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  // -------------------------------------------------------------------------
  // orders/:id/start
  // -------------------------------------------------------------------------

  @Post("orders/:id/start")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "orderStart",
    summary: "Order başlat",
    description:
      "status='pending' olan order'ı 'in_progress' yapar. " +
      "Aksi durumda → 409 VET-ORDER-0001.",
  })
  public async start(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Order> {
    const tenantId = this.requireTenant(actor);
    return this.service.start(tenantId, id, actor);
  }

  // -------------------------------------------------------------------------
  // orders/:id/complete
  // -------------------------------------------------------------------------

  @Post("orders/:id/complete")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "orderComplete",
    summary: "Order tamamla",
    description:
      "status='in_progress' olan order'ı 'completed' yapar; " +
      "completedAt + completedBy set edilir. " +
      "Aksi durumda → 409 VET-ORDER-0001.",
  })
  public async complete(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Order> {
    const tenantId = this.requireTenant(actor);
    return this.service.complete(tenantId, id, actor);
  }

  // -------------------------------------------------------------------------
  // orders/:id/cancel
  // -------------------------------------------------------------------------

  @Post("orders/:id/cancel")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "orderCancel",
    summary: "Order iptal",
    description:
      "status='pending' veya 'in_progress' olan order'ı 'cancelled' " +
      "yapar; cancelledAt + cancellationReason set edilir. " +
      "Tamamlanmış/cancelled → 409 VET-ORDER-0001.",
  })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orderCancelInputSchema))
    body: OrderCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Order> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancel(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------
  // patients/:id/treatment-plan
  // -------------------------------------------------------------------------

  @Get("patients/:id/treatment-plan")
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "patientTreatmentPlan",
    summary: "Hasta tedavi planı",
    description:
      "Patient'a ait tüm order'ları aktif (pending+in_progress) ve " +
      "tamamlanmış (completed+cancelled) olarak ayırır.",
  })
  public async treatmentPlan(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<OrderTreatmentPlan> {
    const tenantId = this.requireTenant(actor);
    return this.service.getTreatmentPlan(tenantId, id, actor);
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
