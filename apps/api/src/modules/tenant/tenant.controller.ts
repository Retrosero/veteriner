/**
 * @file Tenant controller.
 * @module apps/api/modules/tenant/tenant.controller
 *
 * @description Tenant REST API. CRUD + close endpoint'leri.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/tenants`                — Yeni tenant (SUPERADMIN)
 * - `GET    /api/v1/tenants`                — Liste
 * - `GET    /api/v1/tenants/:id`            — Detay
 * - `PATCH  /api/v1/tenants/:id`            — Güncelle
 * - `POST   /api/v1/tenants/:id/close`      — Kapat (SUPERADMIN)
 *
 * @security Tüm endpoint'ler `ActorInterceptor` üzerinden actor
 *   bilgisi alır. Service katmanı SUPERADMIN kontrolü uygular.
 *   Cross-tenant denemesi → 404 (bilgi sızdırmaz).
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
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
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type {
  CloseTenantRequest,
  CreateTenantRequest,
  TenantListResponse,
  TenantResponse,
  UpdateTenantRequest,
} from "@vetniva/contracts";
import {
  closeTenantRequestSchema,
  createTenantRequestSchema,
  listTenantsQuerySchema,
  updateTenantRequestSchema,
} from "@vetniva/contracts";

import { TenantService } from "./tenant.service.js";

@ApiTags("tenants")
@Controller("api/v1/tenants")
export class TenantController {
  public constructor(private readonly service: TenantService) {}

  /**
   * Yeni tenant oluşturur. SUPERADMIN yetkisi gerekir.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "tenantCreate",
    summary: "Yeni tenant oluşturma (SUPERADMIN)",
    description:
      "Yeni tenant kaydı oluşturur. Yalnızca SUPERADMIN tarafından çağrılabilir.",
  })
  @ApiResponse({ status: 201, description: "Tenant oluşturuldu." })
  @ApiResponse({ status: 409, description: "Slug zaten kayıtlı." })
  public async create(
    @Body(new ZodValidationPipe(createTenantRequestSchema))
    body: CreateTenantRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.create(body, actor);
  }

  /**
   * Tenant listesi. SUPERADMIN tüm tenant'ları görür; tenant
   * kullanıcısı yalnızca kendi tenant'ını.
   */
  @Get()
  @ApiOperation({
    operationId: "tenantList",
    summary: "Tenant listesi",
    description:
      "Sayfalı tenant listesi. SUPERADMIN tüm tenant'ları görür; tenant kullanıcısı yalnızca kendi tenant'ını.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  public async list(
    @Query(new ZodValidationPipe(listTenantsQuerySchema))
    query: ReturnType<typeof listTenantsQuerySchema.parse>,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantListResponse> {
    // exactOptionalPropertyTypes uyumu: spread sonrası `undefined` olan
    // alanları service'e geçirme (listArgs zaten daraltıyor).
    return this.service.list({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.country !== undefined ? { country: query.country } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
      actor,
    });
  }

  /**
   * Tenant detayı. Cross-tenant denemesi → 404.
   */
  @Get(":id")
  @ApiOperation({
    operationId: "tenantGetById",
    summary: "Tenant detayı",
    description:
      "ID'ye göre tenant getirir. Tenant kullanıcısı yalnızca kendi tenant'ını görebilir; aksi 404.",
  })
  @ApiResponse({ status: 200, description: "Tenant döner." })
  @ApiResponse({ status: 404, description: "Tenant bulunamadı." })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.findById(id, actor);
  }

  /**
   * Tenant güncelleme. SUPERADMIN veya kendi tenant OWNER'ı.
   */
  @Patch(":id")
  @ApiOperation({
    operationId: "tenantUpdate",
    summary: "Tenant güncelleme",
    description:
      "Tenant ad, contactEmail, timezone, status alanlarını günceller. SUPERADMIN tüm tenant'ları, OWNER yalnızca kendi tenant'ını günceller.",
  })
  @ApiResponse({ status: 200, description: "Tenant güncellendi." })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateTenantRequestSchema))
    body: UpdateTenantRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.update(id, body, actor);
  }

  /**
   * Tenant kapatma. Yalnızca SUPERADMIN. Fiziksel silme yok;
   * `status = closed` ve `archivedAt` set edilir.
   */
  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "tenantClose",
    summary: "Tenant kapatma (SUPERADMIN)",
    description:
      "Tenant'ı kapatır (soft delete). Fiziksel silme yok; audit log korunur.",
  })
  @ApiResponse({ status: 200, description: "Tenant kapatıldı." })
  public async close(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(closeTenantRequestSchema))
    body: CloseTenantRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.close(id, body, actor);
  }
}
