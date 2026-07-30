/**
 * @file Tenant controller.
 * @module apps/api/modules/tenant/tenant.controller
 *
 * @description Tenant REST API. CRUD + close endpoint'leri.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/tenants`                â€” Yeni tenant (SUPERADMIN)
 * - `GET    /api/v1/tenants`                â€” Liste
 * - `GET    /api/v1/tenants/:id`            â€” Detay
 * - `PATCH  /api/v1/tenants/:id`            â€” GÃ¼ncelle
 * - `POST   /api/v1/tenants/:id/close`      â€” Kapat (SUPERADMIN)
 *
 * @security TÃ¼m endpoint'ler `ActorInterceptor` Ã¼zerinden actor
 *   bilgisi alÄ±r. Service katmanÄ± SUPERADMIN kontrolÃ¼ uygular.
 *   Cross-tenant denemesi â†’ 404 (bilgi sÄ±zdÄ±rmaz).
 *   GOAL-012: `@RequirePermissions()` dekoratÃ¶rÃ¼ ile explicit yetki
 *   kontrolÃ¼; PermissionsGuard RBAC motorunu Ã§alÄ±ÅŸtÄ±rÄ±r.
 *
 * @since GOAL-010 (FAZ-1) tenant ve ÅŸube altyapÄ±sÄ±
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
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
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
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
@UseGuards(PermissionsGuard)
@Controller("api/v1/tenants")
export class TenantController {
  public constructor(private readonly service: TenantService) {}

  /**
   * Yeni tenant oluÅŸturur. SUPERADMIN yetkisi gerekir.
   */
  @Post()
  @RequirePermissions("tenant:tenant:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "tenantCreate",
    summary: "Yeni tenant oluÅŸturma (SUPERADMIN)",
    description:
      "Yeni tenant kaydÄ± oluÅŸturur. YalnÄ±zca SUPERADMIN tarafÄ±ndan Ã§aÄŸrÄ±labilir.",
  })
  @ApiResponse({ status: 201, description: "Tenant oluÅŸturuldu." })
  @ApiResponse({ status: 409, description: "Slug zaten kayÄ±tlÄ±." })
  public async create(
    @Body(new ZodValidationPipe(createTenantRequestSchema))
    body: CreateTenantRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.create(body, actor);
  }

  /**
   * Tenant listesi. SUPERADMIN tÃ¼m tenant'larÄ± gÃ¶rÃ¼r; tenant
   * kullanÄ±cÄ±sÄ± yalnÄ±zca kendi tenant'Ä±nÄ±.
   */
  @Get()
  @RequirePermissions("tenant:tenant:read")
  @ApiOperation({
    operationId: "tenantList",
    summary: "Tenant listesi",
    description:
      "SayfalÄ± tenant listesi. SUPERADMIN tÃ¼m tenant'larÄ± gÃ¶rÃ¼r; tenant kullanÄ±cÄ±sÄ± yalnÄ±zca kendi tenant'Ä±nÄ±.",
  })
  @ApiResponse({ status: 200, description: "Liste dÃ¶ner." })
  public async list(
    @Query(new ZodValidationPipe(listTenantsQuerySchema))
    query: ReturnType<typeof listTenantsQuerySchema.parse>,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantListResponse> {
    // exactOptionalPropertyTypes uyumu: spread sonrasÄ± `undefined` olan
    // alanlarÄ± service'e geÃ§irme (listArgs zaten daraltÄ±yor).
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
   * Tenant detayÄ±. Cross-tenant denemesi â†’ 404.
   */
  @Get(":id")
  @RequirePermissions("tenant:tenant:read")
  @ApiOperation({
    operationId: "tenantGetById",
    summary: "Tenant detayÄ±",
    description:
      "ID'ye gÃ¶re tenant getirir. Tenant kullanÄ±cÄ±sÄ± yalnÄ±zca kendi tenant'Ä±nÄ± gÃ¶rebilir; aksi 404.",
  })
  @ApiResponse({ status: 200, description: "Tenant dÃ¶ner." })
  @ApiResponse({ status: 404, description: "Tenant bulunamadÄ±." })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.findById(id, actor);
  }

  /**
   * Tenant gÃ¼ncelleme. SUPERADMIN veya kendi tenant OWNER'Ä±.
   */
  @Patch(":id")
  @RequirePermissions("tenant:tenant:update")
  @ApiOperation({
    operationId: "tenantUpdate",
    summary: "Tenant gÃ¼ncelleme",
    description:
      "Tenant ad, contactEmail, timezone, status alanlarÄ±nÄ± gÃ¼nceller. SUPERADMIN tÃ¼m tenant'larÄ±, OWNER yalnÄ±zca kendi tenant'Ä±nÄ± gÃ¼nceller.",
  })
  @ApiResponse({ status: 200, description: "Tenant gÃ¼ncellendi." })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateTenantRequestSchema))
    body: UpdateTenantRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.update(id, body, actor);
  }

  /**
   * Tenant kapatma. YalnÄ±zca SUPERADMIN. Fiziksel silme yok;
   * `status = closed` ve `archivedAt` set edilir.
   */
  @Post(":id/close")
  @RequirePermissions("tenant:tenant:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "tenantClose",
    summary: "Tenant kapatma (SUPERADMIN)",
    description:
      "Tenant'Ä± kapatÄ±r (soft delete). Fiziksel silme yok; audit log korunur.",
  })
  @ApiResponse({ status: 200, description: "Tenant kapatÄ±ldÄ±." })
  public async close(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(closeTenantRequestSchema))
    body: CloseTenantRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantResponse> {
    return this.service.close(id, body, actor);
  }
}
