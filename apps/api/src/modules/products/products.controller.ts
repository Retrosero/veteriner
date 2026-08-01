/**
 * @file Product (ürün/hizmet kataloğu) controller.
 * @module apps/api/modules/products/products.controller
 *
 * @description Ürün/hizmet kataloğu REST API. Klinik + petshop
 *   ortak katalog. Tenant ID URL'de taşınmaz; actor.tenantId'den
 *   alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/catalog/products`           — Yeni ürün/hizmet
 * - `GET    /api/v1/catalog/products`           — Arama + pagination
 * - `GET    /api/v1/catalog/products/:id`       — Detay
 * - `PATCH  /api/v1/catalog/products/:id`       — Kısmi güncelleme
 * - `POST   /api/v1/catalog/products/:id/archive` — Soft delete
 *
 * @since GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core
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
import {
  productArchiveInputSchema,
  productCreateInputSchema,
  productFiltersSchema,
  productUpdateInputSchema,
  type Product,
  type ProductArchiveInput,
  type ProductCreateInput,
  type ProductFilters,
  type ProductListResponse,
  type ProductUpdateInput,
} from "@vetniva/contracts";

import { ProductsService } from "./products.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("catalog/products")
@UseGuards(PermissionsGuard)
@Controller("api/v1/catalog/products")
export class ProductsController {
  public constructor(private readonly service: ProductsService) {}

  @Post()
  @RequirePermissions("catalog:product:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "productCreate",
    summary: "Yeni ürün/hizmet",
    description:
      "Klinik + petshop ortak kataloğa yeni ürün/hizmet ekler. " +
      "SKU verilmediyse otomatik üretilir; tenant içinde SKU ve " +
      "barkod benzersizdir.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 409, description: "Duplicate SKU/barkod." })
  @ApiResponse({ status: 422, description: "Validation hatası." })
  public async create(
    @Body(new ZodValidationPipe(productCreateInputSchema))
    body: ProductCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Product> {
    const tenantId = this.requireTenant(actor);
    return this.service.createProduct(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("catalog:product:read")
  @ApiOperation({
    operationId: "productList",
    summary: "Ürün/hizmet arama",
    description:
      "Tenant-scoped arama. kind/kinds/clinic/petshop/search/" +
      "category/active filtreleri; arşivlenmiş kayıtlar dönmez.",
  })
  public async list(
    @Query(new ZodValidationPipe(productFiltersSchema))
    query: ProductFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ProductListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listProducts(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("catalog:product:read")
  @ApiOperation({
    operationId: "productGetById",
    summary: "Ürün detayı",
    description: "ID'ye göre ürün getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Product> {
    const tenantId = this.requireTenant(actor);
    const product = await this.service.getProduct(tenantId, id, actor);
    if (!product) {
      throw new DomainError({
        errorCode: "VET-PRODUCT-0001",
        message: "Ürün bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRODUCT-0001",
      });
    }
    return product;
  }

  @Patch(":id")
  @RequirePermissions("catalog:product:update")
  @ApiOperation({
    operationId: "productUpdate",
    summary: "Ürün kısmi güncelleme",
    description:
      "Yalnızca set edilen alanlar değişir. Arşivli kayıt " +
      "güncellenemez (409 VET-PRODUCT-0004). SKU/barkod değişirse " +
      "unique kontrolü yapılır.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(productUpdateInputSchema))
    body: ProductUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Product> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateProduct(tenantId, id, body, actor);
  }

  @Post(":id/archive")
  @RequirePermissions("catalog:product:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "productArchive",
    summary: "Ürün arşivleme",
    description:
      "Soft delete: archivedAt set edilir. Geçmiş satış/alış " +
      "hareketleri audit trail'de korunur.",
  })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(productArchiveInputSchema))
    body: ProductArchiveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Product> {
    const tenantId = this.requireTenant(actor);
    return this.service.archiveProduct(tenantId, id, body, actor);
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
