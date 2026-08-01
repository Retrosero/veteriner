/**
 * @file CustomerBalances controller.
 * @module apps/api/modules/customer-balances/customer-balances.controller
 * @description GOAL-075 (FAZ-7) müşteri borç/alacak REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `GET /api/v1/customer-balances/owners/:ownerId`
 *   → özet (toplam satış/tahsilat/ters kayıt/net/açık bakiye).
 * - `GET /api/v1/customer-balances/owners/:ownerId/transactions`
 *   → işlem geçmişi (satış + tahsilat karışık liste).
 * @since GOAL-075 (FAZ-7) müşteri borç/alacak görünümü core
 */

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  customerTransactionsFiltersSchema,
  type CustomerBalanceSummary,
  type CustomerTransactionsFilters,
  type CustomerTransactionsResponse,
} from "@vetniva/contracts";

import { CustomerBalancesService } from "./customer-balances.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("customer-balances")
@UseGuards(PermissionsGuard)
@Controller("api/v1/customer-balances")
export class CustomerBalancesController {
  public constructor(private readonly service: CustomerBalancesService) {}

  @Get("owners/:ownerId")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "customerBalanceSummary",
    summary: "Müşteri borç/alacak özeti",
    description:
      "Sahip (owner) bazında toplam satış, tahsilat, ters kayıt, " +
      "net tutar, açık bakiye ve son işlem tarihleri.",
  })
  public async summary(
    @Param("ownerId", new ParseUUIDPipe()) ownerId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<CustomerBalanceSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.getSummary(tenantId, ownerId, actor);
  }

  @Get("owners/:ownerId/transactions")
  @RequirePermissions("clinic:payment:read")
  @ApiOperation({
    operationId: "customerBalanceTransactions",
    summary: "Müşteri işlem geçmişi",
    description:
      "Sahibin tüm satış + tahsilat işlemleri; tarih sıralı " +
      "(default desc). type filtresi opsiyonel.",
  })
  public async transactions(
    @Param("ownerId", new ParseUUIDPipe()) ownerId: string,
    @Query(new ZodValidationPipe(customerTransactionsFiltersSchema))
    query: CustomerTransactionsFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<CustomerTransactionsResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listTransactions(tenantId, ownerId, query, actor);
  }

  private requireTenant(actor: ActorContext): string {
    if (actor.tenantId) return actor.tenantId;
    throw new Error("Tenant bağlamı zorunlu");
  }
}
