/**
 * @file Fiyat listeleri controller.
 * @module apps/api/modules/pricing/pricing.controller
 *
 * @description GOAL-070 (FAZ-7) tenant bazlı fiyat listesi altyapısı
 * REST API. Tenant ID URL'de taşınmaz; actor.tenantId'den alınır
 * (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/pricing/lists`              — Yeni fiyat listesi
 * - `GET    /api/v1/pricing/lists`              — Arama + pagination
 * - `GET    /api/v1/pricing/lists/:id`          — Detay
 * - `PATCH  /api/v1/pricing/lists/:id`          — Kısmi güncelleme
 *                                                  (yalnızca draft)
 * - `POST   /api/v1/pricing/lists/:id/activate` — Draft → active
 * - `POST   /api/v1/pricing/lists/:id/archive`  — Soft delete
 * - `POST   /api/v1/pricing/lists/:id/items`    — Yeni fiyat satırı
 * - `GET    /api/v1/pricing/lists/:id/items`    — Satır listesi
 * - `PATCH  /api/v1/pricing/lists/:id/items/:itemId` — Append-only
 *                                                     düzeltme
 * - `POST   /api/v1/pricing/lists/:id/items/:itemId/cancel` — İptal
 * - `GET    /api/v1/pricing/products/:productId/price` — Resolver
 *                  (?effectiveAt=ISO; default now)
 *
 * @since GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri core
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
  priceListArchiveInputSchema,
  priceListCreateInputSchema,
  priceListFiltersSchema,
  priceListItemCreateInputSchema,
  priceListItemFiltersSchema,
  priceListItemUpdateInputSchema,
  priceListUpdateInputSchema,
  productPriceResolutionSchema,
  type PriceList,
  type PriceListArchiveInput,
  type PriceListCreateInput,
  type PriceListFilters,
  type PriceListItem,
  type PriceListItemCreateInput,
  type PriceListItemFilters,
  type PriceListItemListResponse,
  type PriceListItemUpdateInput,
  type PriceListListResponse,
  type PriceListUpdateInput,
  type ProductPriceResolution,
} from "@vetniva/contracts";

import { PricingService } from "./pricing.service.js";

@ApiTags("pricing/lists")
@UseGuards(PermissionsGuard)
@Controller("api/v1/pricing/lists")
export class PricingController {
  public constructor(private readonly service: PricingService) {}

  // ---------------------------------------------------------------------------
  // PriceList endpoints
  // ---------------------------------------------------------------------------

  @Post()
  @RequirePermissions("pricing:price_list:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "priceListCreate",
    summary: "Yeni fiyat listesi",
    description:
      "Tenant-scoped yeni fiyat listesi oluşturur. customer_specific " +
      "türünde customerId zorunlu. Status başlangıçta 'draft'.",
  })
  public async create(
    @Body(new ZodValidationPipe(priceListCreateInputSchema))
    body: PriceListCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceList> {
    const tenantId = this.requireTenant(actor);
    return this.service.createPriceList(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("pricing:price_list:read")
  @ApiOperation({
    operationId: "priceListList",
    summary: "Fiyat listesi arama",
    description:
      "Tenant-scoped arama. type/status/customerId/effectiveAt/" +
      "search filtreleri. effectiveAt ile belirli tarihte geçerli " +
      "listeler getirilir.",
  })
  public async list(
    @Query(new ZodValidationPipe(priceListFiltersSchema))
    query: PriceListFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceListListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listPriceLists(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("pricing:price_list:read")
  @ApiOperation({
    operationId: "priceListGetById",
    summary: "Fiyat listesi detayı",
    description: "ID'ye göre fiyat listesi getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceList> {
    const tenantId = this.requireTenant(actor);
    const list = await this.service.getPriceList(tenantId, id, actor);
    if (!list) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { id },
      });
    }
    return list;
  }

  @Patch(":id")
  @RequirePermissions("pricing:price_list:update")
  @ApiOperation({
    operationId: "priceListUpdate",
    summary: "Fiyat listesi kısmi güncelleme",
    description:
      "Yalnızca set edilen alanlar değişir. Yalnızca status='draft' " +
      "iken kabul edilir; aktif listede 409 VET-PRICING-0006. " +
      "Arşivli listede 409 VET-PRICING-0007.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(priceListUpdateInputSchema))
    body: PriceListUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceList> {
    const tenantId = this.requireTenant(actor);
    return this.service.updatePriceList(tenantId, id, body, actor);
  }

  @Post(":id/activate")
  @RequirePermissions("pricing:price_list:update")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "priceListActivate",
    summary: "Fiyat listesini aktifleştir",
    description:
      "draft → active geçişi. En az bir aktif fiyat satırı olmalı " +
      "(422 VET-PRICING-0010). Zaten aktif ise idempotent (no-op).",
  })
  public async activate(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceList> {
    const tenantId = this.requireTenant(actor);
    return this.service.activatePriceList(tenantId, id, actor);
  }

  @Post(":id/archive")
  @RequirePermissions("pricing:price_list:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "priceListArchive",
    summary: "Fiyat listesi arşivleme",
    description:
      "Soft delete: archivedAt set edilir, status='archived'. " +
      "Geçmiş satış fiyatları audit trail'de korunur.",
  })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(priceListArchiveInputSchema))
    body: PriceListArchiveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceList> {
    const tenantId = this.requireTenant(actor);
    return this.service.archivePriceList(tenantId, id, body, actor);
  }

  // ---------------------------------------------------------------------------
  // PriceListItem endpoints
  // ---------------------------------------------------------------------------

  @Post(":id/items")
  @RequirePermissions("pricing:price_list:update")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "priceListItemCreate",
    summary: "Fiyat satırı ekle",
    description:
      "Listeye yeni fiyat satırı ekler. Aynı ürün için aynı " +
      "listede aktif satır varsa 409 VET-PRICING-0003 (düzeltme " +
      "için PATCH kullanın). Ürün arşivli 422 VET-PRICING-0009.",
  })
  public async addItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(priceListItemCreateInputSchema))
    body: PriceListItemCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceListItem> {
    const tenantId = this.requireTenant(actor);
    return this.service.addItem(tenantId, id, body, actor);
  }

  @Get(":id/items")
  @RequirePermissions("pricing:price_list:read")
  @ApiOperation({
    operationId: "priceListItemList",
    summary: "Fiyat satırlarını listele",
    description:
      "Liste düzeyinde fiyat satırlarını getirir. productId/status " +
      "filtreleri. Append-only: superseded satırlar da döner.",
  })
  public async listItems(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(priceListItemFiltersSchema))
    query: PriceListItemFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceListItemListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listItems(tenantId, id, query, actor);
  }

  @Patch(":id/items/:itemId")
  @RequirePermissions("pricing:price_list:update")
  @ApiOperation({
    operationId: "priceListItemAmend",
    summary: "Fiyat satırı append-only düzeltme",
    description:
      "Yeni satır oluşturur, eski satır status='superseded' olur. " +
      "Yalnızca taslak (draft) listede ve yalnızca aktif satır " +
      "için. supersedesId ile düzeltme zinciri korunur.",
  })
  public async updateItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body(new ZodValidationPipe(priceListItemUpdateInputSchema))
    body: PriceListItemUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceListItem> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateItem(tenantId, id, itemId, body, actor);
  }

  @Post(":id/items/:itemId/cancel")
  @RequirePermissions("pricing:price_list:update")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "priceListItemCancel",
    summary: "Fiyat satırı iptal",
    description:
      "Aktif satırı status='cancelled' yapar. Idempotent: zaten " +
      "iptal edilmiş ise no-op. superseded satır iptal edilemez.",
  })
  public async cancelItem(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceListItem> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelItem(tenantId, id, itemId, actor);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

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

/**
 * Ürün için fiyat çözümleme controller. PricingService'in ayrı
 * rotada olması; URL'de liste ID taşımadan, ürün ID ile doğrudan
 * erişim sağlar.
 */
@ApiTags("pricing/products")
@UseGuards(PermissionsGuard)
@Controller("api/v1/pricing/products")
export class PricingProductController {
  public constructor(private readonly service: PricingService) {}

  @Get(":productId/price")
  @RequirePermissions("pricing:price_list:read")
  @ApiOperation({
    operationId: "productPriceResolve",
    summary: "Ürün fiyat çözümleme",
    description:
      "Belirtilen tarihte (default now) ürün için geçerli tüm fiyat " +
      "adaylarını döner. Adaylar tür önceliği (customer_specific > " +
      "promotional > standard) + tarihe göre sıralıdır. Hiç aday " +
      "yoksa 404 VET-PRICING-0011.",
  })
  public async resolve(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Query("effectiveAt") effectiveAt: string | undefined,
    @CurrentActor() actor: ActorContext,
  ): Promise<ProductPriceResolution> {
    const tenantId = this.requireTenant(actor);
    const date =
      effectiveAt !== undefined && effectiveAt.length > 0
        ? new Date(effectiveAt)
        : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Geçersiz tarih",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { effectiveAt },
      });
    }
    const result = await this.service.resolveProductPrice(
      tenantId,
      productId,
      date,
      actor,
    );
    // Validate response (defensive).
    return productPriceResolutionSchema.parse(result);
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
