/**
 * @file Payment (tahsilat) controller.
 * @module apps/api/modules/payments/payments.controller
 *
 * @description GOAL-072 (FAZ-7) tahsilat REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/payments`                  — Yeni tahsilat
 * - `GET    /api/v1/payments`                  — Arama
 * - `GET    /api/v1/payments/:id`              — Detay
 * - `POST   /api/v1/payments/:id/reverse`      — Ters kayıt
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
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
  paymentCreateInputSchema,
  paymentFiltersSchema,
  paymentReverseInputSchema,
  type Payment,
  type PaymentCreateInput,
  type PaymentFilters,
  type PaymentListResponse,
  type PaymentReverseInput,
} from "@vetniva/contracts";

import { PaymentsService } from "./payments.service.js";

@ApiTags("payments")
@UseGuards(PermissionsGuard)
@Controller("api/v1/payments")
export class PaymentsController {
  public constructor(
    private readonly service: PaymentsService,
  ) {}

  @Post()
  @RequirePermissions("clinic:payment:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "paymentCreate",
    summary: "Yeni tahsilat",
    description:
      "Klinik satış veya petshop satış için tahsilat. Aynı " +
      "idempotencyKey ile 2. çağrıda mevcut kayıt döner " +
      "(farklı body → 409 VET-PAYMENT-0005).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(paymentCreateInputSchema))
    body: PaymentCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Payment> {
    const tenantId = this.requireTenant(actor);
    return this.service.createPayment(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "paymentList",
    summary: "Tahsilat arama",
    description:
      "Tenant-scoped arama. status/sourceType/sourceId/method " +
      "filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(paymentFiltersSchema))
    query: PaymentFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PaymentListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listPayments(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "paymentGetById",
    summary: "Tahsilat detayı",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Payment> {
    const tenantId = this.requireTenant(actor);
    const payment = await this.service.getPaymentDetail(tenantId, id, actor);
    if (!payment) {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0001",
        message: "Tahsilat bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PAYMENT-0001",
      });
    }
    return payment;
  }

  @Post(":id/reverse")
  @RequirePermissions("clinic:payment:reverse")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "paymentReverse",
    summary: "Tahsilat ters kaydı",
    description:
      "completed → reversed. Zaten reversed ise 409 VET-PAYMENT-0002. " +
      "Ters kayıt nedeni zorunlu.",
  })
  public async reverse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(paymentReverseInputSchema))
    body: PaymentReverseInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Payment> {
    const tenantId = this.requireTenant(actor);
    return this.service.reversePayment(tenantId, id, body, actor);
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
