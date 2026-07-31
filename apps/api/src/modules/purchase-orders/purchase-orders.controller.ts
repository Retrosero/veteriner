/**
 * @file PurchaseOrder (satın alma siparişi) controller.
 * @module apps/api/modules/purchase-orders/purchase-orders.controller
 *
 * @description GOAL-062 (FAZ-6) satın alma siparişi REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır
 *   (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/inventory/purchase-orders`              — Yeni taslak
 * - `GET    /api/v1/inventory/purchase-orders`              — Arama
 * - `GET    /api/v1/inventory/purchase-orders/:id`          — Detay
 * - `PATCH  /api/v1/inventory/purchase-orders/:id`          — Taslak düzenle
 * - `POST   /api/v1/inventory/purchase-orders/:id/approve`  — Onay
 * - `POST   /api/v1/inventory/purchase-orders/:id/receive`  — Mal kabul
 * - `POST   /api/v1/inventory/purchase-orders/:id/cancel`   — İptal
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  purchaseOrderCancelInputSchema,
  purchaseOrderCreateInputSchema,
  purchaseOrderFiltersSchema,
  purchaseOrderReceiveInputSchema,
  purchaseOrderUpdateInputSchema,
  type PurchaseOrderCancelInput,
  type PurchaseOrderCreateInput,
  type PurchaseOrderDetail,
  type PurchaseOrderFilters,
  type PurchaseOrderListResponse,
  type PurchaseOrderReceiveInput,
  type PurchaseOrderUpdateInput,
} from "@vetniva/contracts";

import { PurchaseOrdersService } from "./purchase-orders.service.js";

@ApiTags("inventory/purchase-orders")
@UseGuards(PermissionsGuard)
@Controller("api/v1/inventory/purchase-orders")
export class PurchaseOrdersController {
  public constructor(
    private readonly service: PurchaseOrdersService,
  ) {}

  @Post()
  @RequirePermissions("inventory:purchase_order:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "purchaseOrderCreate",
    summary: "Yeni satın alma sipariş taslağı",
    description:
      "Tedarikçi kataloğundan supplierId ile yeni taslak sipariş. " +
      "En az 1 satır zorunlu. Toplam otomatik hesaplanır. " +
      "Tedarikçi arşivliyse 422 VET-PURCHASE_ORDER-0005.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 422, description: "Validation/bağımlılık." })
  public async create(
    @Body(new ZodValidationPipe(purchaseOrderCreateInputSchema))
    body: PurchaseOrderCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.createPurchaseOrder(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("inventory:purchase_order:read")
  @ApiOperation({
    operationId: "purchaseOrderList",
    summary: "Satın alma sipariş arama",
    description:
      "Tenant-scoped arama. status/supplierId/branchId/search/sort " +
      "filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(purchaseOrderFiltersSchema))
    query: PurchaseOrderFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PurchaseOrderListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listPurchaseOrders(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("inventory:purchase_order:read")
  @ApiOperation({
    operationId: "purchaseOrderGetById",
    summary: "Satın alma sipariş detayı",
    description:
      "Header + satırlar. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getPurchaseOrderDetail(
      tenantId,
      id,
      actor,
    );
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0001",
      });
    }
    return detail;
  }

  @Patch(":id")
  @RequirePermissions("inventory:purchase_order:update")
  @ApiOperation({
    operationId: "purchaseOrderUpdate",
    summary: "Taslak sipariş düzenleme",
    description:
      "Yalnızca `draft` durumdaki siparişler düzenlenebilir. " +
      "Onaylı/alınmış siparişler 409 VET-PURCHASE_ORDER-0004 döner.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(purchaseOrderUpdateInputSchema))
    body: PurchaseOrderUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.updatePurchaseOrder(tenantId, id, body, actor);
  }

  @Post(":id/approve")
  @RequirePermissions("inventory:purchase_order:approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "purchaseOrderApprove",
    summary: "Sipariş onayı",
    description:
      "draft → approved geçişi. Onaylı/alınmış sipariş onaylanamaz " +
      "(409 VET-PURCHASE_ORDER-0002).",
  })
  public async approve(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.approvePurchaseOrder(tenantId, id, actor);
  }

  @Post(":id/receive")
  @RequirePermissions("inventory:purchase_order:receive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "purchaseOrderReceive",
    summary: "Mal kabul",
    description:
      "Satır başına `receivedQuantity` (kabul edilen miktar) + " +
      "`unitCost` (gerçek alış maliyeti). Tüm satırlar tam karşılanırsa " +
      "`received`, aksi `partial`. Toplam kabul orderedQuantity'yi " +
      "aşamaz (422 VET-PURCHASE_ORDER-0007).",
  })
  public async receive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(purchaseOrderReceiveInputSchema))
    body: PurchaseOrderReceiveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.receivePurchaseOrder(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("inventory:purchase_order:cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "purchaseOrderCancel",
    summary: "Sipariş iptali",
    description:
      "draft/approved → cancelled. partial/received iptal edilemez " +
      "(409 VET-PURCHASE_ORDER-0008). İptal nedeni zorunlu.",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(purchaseOrderCancelInputSchema))
    body: PurchaseOrderCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelPurchaseOrder(tenantId, id, body, actor);
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
