/**
 * @file StockMovement (stok hareketi) controller.
 * @module apps/api/modules/stock-movements/stock-movements.controller
 *
 * @description GOAL-063 (FAZ-6) stok hareketleri ve sayım REST API.
 * 9 hareket türünün (purchase/sale/clinical_use/vaccination/return/
 * transfer/count_adjustment/waste/reversal) yönetimi. Tenant ID
 * URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 * koruması).
 *
 * Endpoint'ler:
 * - `POST  /api/v1/inventory/stock-movements`           — Manuel hareket oluştur
 * - `GET   /api/v1/inventory/stock-movements`           — Arama + pagination
 * - `GET   /api/v1/inventory/stock-movements/balances`  — Ürün/lot bakiyeleri
 * - `GET   /api/v1/inventory/stock-movements/:id`       — Detay
 * - `POST  /api/v1/inventory/stock-movements/:id/reverse` — Ters kayıt
 *
 * Sistem akışları (purchase order receive, vaccine application)
 * bu endpoint'i çağırmaz; doğrudan `StockMovementsService.
 * createSystemMovement` üzerinden hareket oluşturur.
 *
 * @since GOAL-063 (FAZ-6) stok hareketleri ve sayım core
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
  stockMovementCreateInputSchema,
  stockMovementFiltersSchema,
  stockMovementReverseInputSchema,
  type StockBalanceListResponse,
  type StockMovement,
  type StockMovementCreateInput,
  type StockMovementFilters,
  type StockMovementListResponse,
  type StockMovementReverseInput,
} from "@vetniva/contracts";

import { StockMovementsService } from "./stock-movements.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("inventory")
@UseGuards(PermissionsGuard)
@Controller("api/v1/inventory/stock-movements")
export class StockMovementsController {
  public constructor(private readonly service: StockMovementsService) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  @Post()
  @RequirePermissions("inventory:stock_movement:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "stockMovementCreate",
    summary: "Yeni stok hareketi",
    description:
      "Manuel UI akışı için yeni stok hareketi oluşturur. " +
      "`count_adjustment`/`waste`/`reversal` türleri için `reason` " +
      "zorunlu. Sistem akışları (purchase order receive, vaccine " +
      "application) bu endpoint'i kullanmaz.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Ürün/lot bulunamadı." })
  @ApiResponse({ status: 409, description: "Arşivli kayıt." })
  @ApiResponse({ status: 422, description: "Geçersiz veri / neden eksik." })
  public async create(
    @Body(new ZodValidationPipe(stockMovementCreateInputSchema))
    body: StockMovementCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockMovement> {
    const tenantId = this.requireTenant(actor);
    return this.service.createMovement(tenantId, body, actor);
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  @Get()
  @RequirePermissions("inventory:stock_movement:read")
  @ApiOperation({
    operationId: "stockMovementList",
    summary: "Stok hareketlerini ara",
    description:
      "Tenant-scoped arama; productId/lotId/type/sourceType/" +
      "occurredFrom/occurredTo filtresi. occurredAt DESC sıralı.",
  })
  public async list(
    @Query(new ZodValidationPipe(stockMovementFiltersSchema))
    query: StockMovementFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockMovementListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listMovements(tenantId, query, actor);
  }

  // -------------------------------------------------------------------------
  // balances
  // -------------------------------------------------------------------------

  @Get("balances")
  @RequirePermissions("inventory:stock_movement:read")
  @ApiOperation({
    operationId: "stockMovementBalances",
    summary: "Ürün/lot bakiyeleri",
    description:
      "Tenant-scoped bakiye listesi. Her (productId, lotId) için " +
      "`netQuantity` ve `movementCount` döner.",
  })
  public async balances(
    @Query("productId") productId: string | undefined,
    @Query("lotId") lotId: string | undefined,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockBalanceListResponse> {
    const tenantId = this.requireTenant(actor);
    const filters: { productId?: string; lotId?: string } = {};
    if (productId) filters.productId = productId;
    if (lotId) filters.lotId = lotId;
    return this.service.listPersistentBalances(tenantId, actor, filters);
  }

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  @Get(":id")
  @RequirePermissions("inventory:stock_movement:read")
  @ApiOperation({
    operationId: "stockMovementGetById",
    summary: "Stok hareketi detayı",
    description: "ID'ye göre tek hareket getirir. Cross-tenant → 404.",
  })
  public async getById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockMovement> {
    const tenantId = this.requireTenant(actor);
    const rec = await this.service.getMovement(tenantId, id, actor);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-STOCK-0001",
        message: "Stok hareketi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0001",
        details: { id },
      });
    }
    return rec;
  }

  // -------------------------------------------------------------------------
  // reverse
  // -------------------------------------------------------------------------

  @Post(":id/reverse")
  @RequirePermissions("inventory:stock_movement:reverse")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "stockMovementReverse",
    summary: "Stok hareketini tersine çevir",
    description:
      "Yeni bir `reversal` hareketi oluşturur. Orijinal hareket " +
      "değişmez (append-only). Aynı orijinale zaten ters kayıt " +
      "yazıldıysa 409. `reason` zorunlu.",
  })
  public async reverse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(stockMovementReverseInputSchema))
    body: StockMovementReverseInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<StockMovement> {
    const tenantId = this.requireTenant(actor);
    return this.service.reverseMovement(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------

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
