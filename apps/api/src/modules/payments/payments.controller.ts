/**
 * @file Payment (tahsilat) controller.
 * @module apps/api/modules/payments/payments.controller
 *
 * @description GOAL-072 (FAZ-7) tahsilat + GOAL-073 (FAZ-7) tahsilat
 * iptal ve ters kayıt REST API. Tenant ID URL'de taşınmaz;
 * actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/payments`                       — Yeni tahsilat
 * - `GET    /api/v1/payments`                       — Arama
 * - `GET    /api/v1/payments/:id`                   — Detay
 * - `POST   /api/v1/payments/:id/reverse`           — Tam/kısmi
 *                                                     ters kayıt
 * - `GET    /api/v1/payments/reversals`             — Ters kayıt
 *                                                     arama
 * - `GET    /api/v1/payments/reversals/:reversalId` — Ters kayıt
 *                                                     detay
 * - `GET    /api/v1/payments/:id/reversals/summary` — Ters kayıt
 *                                                     özeti
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 * @updated GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
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
  paymentReversalCreateInputSchema,
  paymentReversalFiltersSchema,
  type Payment,
  type PaymentCreateInput,
  type PaymentFilters,
  type PaymentListResponse,
  type PaymentReversal,
  type PaymentReversalCreateInput,
  type PaymentReversalFilters,
  type PaymentReversalListResponse,
  type PaymentReversalSummary,
} from "@vetniva/contracts";

import { PaymentsService } from "./payments.service.js";

@ApiTags("payments")
@UseGuards(PermissionsGuard)
@Controller("api/v1/payments")
export class PaymentsController {
  public constructor(
    private readonly service: PaymentsService,
  ) {}

  // ===========================================================================
  // POST /api/v1/payments
  // ===========================================================================

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

  // ===========================================================================
  // GET /api/v1/payments
  // ===========================================================================

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

  // ===========================================================================
  // GET /api/v1/payments/reversals (route'lar /:id'den önce gelmeli)
  // ===========================================================================

  @Get("reversals")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "paymentReversalList",
    summary: "Tahsilat ters kayıt arama",
    description:
      "Tenant-scoped arama. paymentId/sourceType/sourceId/" +
      "reason/from/to/sort filtreleri.",
  })
  public async listReversals(
    @Query(new ZodValidationPipe(paymentReversalFiltersSchema))
    query: PaymentReversalFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PaymentReversalListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listPaymentReversals(tenantId, query, actor);
  }

  // ===========================================================================
  // GET /api/v1/payments/reversals/:reversalId
  // ===========================================================================

  @Get("reversals/:reversalId")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "paymentReversalGetById",
    summary: "Ters kayıt detayı",
    description: "Cross-tenant → 404.",
  })
  public async findReversalById(
    @Param("reversalId", new ParseUUIDPipe()) reversalId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PaymentReversal> {
    const tenantId = this.requireTenant(actor);
    const reversal = await this.service.getPaymentReversalDetail(
      tenantId,
      reversalId,
      actor,
    );
    if (!reversal) {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0001",
        message: "Ters kayıt bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PAYMENT-0001",
      });
    }
    return {
      id: reversal.id,
      tenantId: reversal.tenantId,
      paymentId: reversal.paymentId,
      sourceType: reversal.sourceType,
      sourceId: reversal.sourceId,
      amount: reversal.amount,
      method: reversal.method,
      currency: reversal.currency,
      reason: reversal.reason,
      note: reversal.note,
      cashRegisterEffect: reversal.cashRegisterEffect,
      reversedAt: reversal.reversedAt,
      reversedBy: reversal.reversedBy,
      createdAt: reversal.createdAt,
    };
  }

  // ===========================================================================
  // GET /api/v1/payments/:id
  // ===========================================================================

  @Get(":id")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "paymentGetById",
    summary: "Tahsilat detayı",
    description:
      "Cross-tenant → 404. effectiveAmount ve reversedAmount " +
      "alanları kümülatif ters kayıt bilgisini içerir.",
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

  // ===========================================================================
  // GET /api/v1/payments/:id/reversals/summary
  // ===========================================================================

  @Get(":id/reversals/summary")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "paymentReversalSummary",
    summary: "Tahsilat ters kayıt özeti",
    description:
      "paymentAmount, totalReversed, remainingAmount, reversalCount.",
  })
  public async getReversalSummary(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PaymentReversalSummary> {
    const tenantId = this.requireTenant(actor);
    const summary = await this.service.getPaymentReversalSummary(
      tenantId,
      id,
      actor,
    );
    if (!summary) {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0001",
        message: "Tahsilat bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PAYMENT-0001",
      });
    }
    return summary;
  }

  // ===========================================================================
  // POST /api/v1/payments/:id/reverse
  // ===========================================================================

  @Post(":id/reverse")
  @RequirePermissions("clinic:payment:reverse")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "paymentReverse",
    summary: "Tahsilat ters kaydı (tam veya kısmi)",
    description:
      "amount opsiyonel: belirtilirse kısmi ters kayıt " +
      "(status='partially_reversed'); aksi durumda kalan tutarın " +
      "tamamı (status='reversed'). amount=0 → 422 VET-PAYMENT-0007; " +
      "amount + sum(reversed) > payment.amount → 422 " +
      "VET-PAYMENT-0008. amount > 1000 TRY için OWNER zorunlu " +
      "(403 VET-PAYMENT-0010). Zaten reversed → 409 VET-PAYMENT-0002.",
  })
  public async reverse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(paymentReversalCreateInputSchema))
    body: PaymentReversalCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Payment> {
    const tenantId = this.requireTenant(actor);
    return this.service.reversePayment(tenantId, id, body, actor);
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

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
