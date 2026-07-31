/**
 * @file Düşük stok ve SKT uyarıları controller.
 * @module apps/api/modules/stock-alerts/stock-alerts.controller
 *
 * @description GOAL-067 (FAZ-6) düşük stok + SKT uyarıları REST API.
 *
 * Endpoint'ler:
 * - `GET  /api/v1/inventory/stock-alerts/low-stock` —
 *   Düşük stok uyarılarını listele
 *   (`inventory:stock_alert:read`).
 * - `GET  /api/v1/inventory/stock-alerts/expiring-lots` —
 *   SKT uyarılarını listele (`inventory:stock_alert:read`).
 * - `POST /api/v1/inventory/stock-alerts/refresh` —
 *   Uyarıları yeniden hesapla (`inventory:stock_alert:read`).
 * - `GET  /api/v1/inventory/stock-alerts/summary` —
 *   Dashboard kartı özeti (`inventory:stock_alert:read`).
 * - `POST /api/v1/inventory/stock-alerts/low-stock/:productId/acknowledge`
 *   — Düşük stok uyarısını acknowledge et
 *   (`inventory:stock_alert:acknowledge`).
 * - `POST /api/v1/inventory/stock-alerts/expiring-lots/:lotId/acknowledge`
 *   — SKT uyarısını acknowledge et
 *   (`inventory:stock_alert:acknowledge`).
 *
 * @since GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları core
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
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  expiringLotAlertAcknowledgeInputSchema,
  expiringLotAlertFiltersSchema,
  lowStockAlertAcknowledgeInputSchema,
  lowStockAlertFiltersSchema,
  stockAlertRefreshInputSchema,
  type ExpiringLotAlert,
  type ExpiringLotAlertFilters,
  type ExpiringLotAlertListResponse,
  type LowStockAlert,
  type LowStockAlertFilters,
  type LowStockAlertListResponse,
  type StockAlertRefreshResponse,
  type StockAlertSummary,
} from "@vetniva/contracts";

import { StockAlertsService } from "./stock-alerts.service.js";

@ApiTags("stock-alerts")
@UseGuards(PermissionsGuard)
@Controller("api/v1/inventory/stock-alerts")
export class StockAlertsController {
  public constructor(private readonly service: StockAlertsService) {}

  // =========================================================================
  // listLowStock
  // =========================================================================

  @Get("low-stock")
  @RequirePermissions("inventory:stock_alert:read")
  @ApiOperation({
    operationId: "stockAlertLowStockList",
    summary: "Düşük stok uyarılarını listele",
    description:
      "Tenant-scoped; severity/status/activeOnly/productId filtreleri. " +
      "Ürün purchaseTracked=true VE lowStockThreshold!=null VE " +
      "currentQuantity<=threshold ise uyarı oluşur.",
  })
  public async listLowStock(
    @Query(new ZodValidationPipe(lowStockAlertFiltersSchema))
    query: LowStockAlertFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<LowStockAlertListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listLowStock(tenantId, query, actor);
  }

  // =========================================================================
  // listExpiringLots
  // =========================================================================

  @Get("expiring-lots")
  @RequirePermissions("inventory:stock_alert:read")
  @ApiOperation({
    operationId: "stockAlertExpiringLotList",
    summary: "SKT uyarılarını listele",
    description:
      "Tenant-scoped; severity/status/lotId/productId/activeOnly/daysAhead " +
      "filtreleri. daysAhead default 30 gün; lot archivedAt=null VE " +
      "ürün archivedAt=null VE expiryDate<=now+daysAhead ise uyarı.",
  })
  public async listExpiringLots(
    @Query(new ZodValidationPipe(expiringLotAlertFiltersSchema))
    query: ExpiringLotAlertFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ExpiringLotAlertListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listExpiringLots(tenantId, query, actor);
  }

  // =========================================================================
  // refresh
  // =========================================================================

  @Post("refresh")
  @RequirePermissions("inventory:stock_alert:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "stockAlertRefresh",
    summary: "Uyarıları yeniden hesapla",
    description:
      "Acknowledge'lar korunur (default) veya resetAcknowledgements=true " +
      "ile sıfırlanır. Sonuç: lowStock/expiring/critical/expired sayıları.",
  })
  public async refresh(
    @Body(new ZodValidationPipe(stockAlertRefreshInputSchema.optional()))
    body: { resetAcknowledgements?: boolean } | undefined,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockAlertRefreshResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.refresh(tenantId, body, actor);
  }

  // =========================================================================
  // summary
  // =========================================================================

  @Get("summary")
  @RequirePermissions("inventory:stock_alert:read")
  @ApiOperation({
    operationId: "stockAlertSummary",
    summary: "Dashboard özet kartı",
    description:
      "computeLowStock + computeExpiringLots(30gün) çağrısı sonucu " +
      "status/severity sayılarını döner.",
  })
  public async summary(
    @CurrentActor() actor: ActorContext,
  ): Promise<StockAlertSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.summary(tenantId, actor);
  }

  // =========================================================================
  // acknowledgeLowStock
  // =========================================================================

  @Post("low-stock/:productId/acknowledge")
  @RequirePermissions("inventory:stock_alert:acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "stockAlertLowStockAcknowledge",
    summary: "Düşük stok uyarısını acknowledge et",
    description:
      "Idempotent. Status='active' → 'acknowledged'. Status='resolved' " +
      "ise 422 VET-STOCK_ALERT-0003.",
  })
  @ApiResponse({ status: 200, description: "Acknowledged." })
  @ApiResponse({ status: 404, description: "Uyarı bulunamadı." })
  @ApiResponse({ status: 422, description: "Resolved uyarı ack edilemez." })
  public async acknowledgeLowStock(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body(new ZodValidationPipe(lowStockAlertAcknowledgeInputSchema.optional()))
    body: { note?: string } | undefined,
    @CurrentActor() actor: ActorContext,
  ): Promise<LowStockAlert> {
    const tenantId = this.requireTenant(actor);
    return this.service.acknowledgeLowStock(tenantId, productId, body?.note, actor);
  }

  // =========================================================================
  // acknowledgeExpiringLot
  // =========================================================================

  @Post("expiring-lots/:lotId/acknowledge")
  @RequirePermissions("inventory:stock_alert:acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "stockAlertExpiringLotAcknowledge",
    summary: "SKT uyarısını acknowledge et",
    description:
      "Idempotent. Status='active' → 'acknowledged'. Status='resolved' " +
      "ise 422 VET-STOCK_ALERT-0003.",
  })
  @ApiResponse({ status: 200, description: "Acknowledged." })
  @ApiResponse({ status: 404, description: "Uyarı bulunamadı." })
  @ApiResponse({ status: 422, description: "Resolved uyarı ack edilemez." })
  public async acknowledgeExpiringLot(
    @Param("lotId", new ParseUUIDPipe()) lotId: string,
    @Body(new ZodValidationPipe(expiringLotAlertAcknowledgeInputSchema.optional()))
    body: { note?: string } | undefined,
    @CurrentActor() actor: ActorContext,
  ): Promise<ExpiringLotAlert> {
    const tenantId = this.requireTenant(actor);
    return this.service.acknowledgeExpiringLot(tenantId, lotId, body?.note, actor);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

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
