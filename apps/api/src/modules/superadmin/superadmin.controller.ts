/**
 * @file Superadmin tenant görünümü controller.
 * @module apps/api/modules/superadmin/superadmin.controller
 *
 * @description SUPERADMIN tenant listesi, detayı ve son audit
 * event'lerini sunan REST API.
 *
 * Endpoint'ler:
 * - `GET /api/v1/superadmin/tenants`         — Filtreli tenant listesi
 * - `GET /api/v1/superadmin/tenants/:id`     — Tek tenant detayı
 * - `GET /api/v1/superadmin/tenants/:id/events` — Son audit event'ler
 *
 * @security Tüm endpoint'ler `PermissionsGuard` +
 *   `@RequirePermissions('audit:log:read')` ile korunur.
 *   SUPERADMIN bypass `RbacService` üzerinden otomatik uygulanır.
 *   Tenant ID bilinmeyen değerler 404 döner (bilgi sızdırmaz).
 *
 * @since GOAL-016 (FAZ-1) superadmin tenant görünümü
 */

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  listSuperadminTenantsQuerySchema,
  type AuditEventSummary,
  type ListSuperadminTenantsResponse,
  type TenantDetailResponse,
} from "@vetniva/contracts";

import { SuperadminService } from "./superadmin.service.js";

@ApiTags("superadmin")
@UseGuards(PermissionsGuard)
@Controller("api/v1/superadmin/tenants")
export class SuperadminController {
  public constructor(private readonly service: SuperadminService) {}

  /**
   * SUPERADMIN tenant listesi. status / country / search filtreleri
   * opsiyonel; sayfalama zorunlu.
   */
  @Get()
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "superadminTenantList",
    summary: "Tüm tenant'ların özet görünümü (SUPERADMIN)",
    description:
      "Tüm tenant'ları özet metriklerle (branch/user count, enabled modules, son login, storage) listeler. Yalnızca SUPERADMIN erişebilir.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async list(
    @Query(new ZodValidationPipe(listSuperadminTenantsQuerySchema))
    query: ReturnType<typeof listSuperadminTenantsQuerySchema.parse>,
  ): Promise<ListSuperadminTenantsResponse> {
    return this.service.listTenants(
      query.page,
      query.pageSize,
      {
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.country !== undefined ? { country: query.country } : {}),
        ...(query.search !== undefined ? { search: query.search } : {}),
      },
    );
  }

  /**
   * Tek tenant detayı. Branch/user/modül/storage metrikleri + son
   * 10 audit event.
   */
  @Get(":id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "superadminTenantDetail",
    summary: "Tenant detay görünümü (SUPERADMIN)",
    description:
      "Tek tenant'ın detay metrikleri ve son 10 audit event'ini döner. Yalnızca SUPERADMIN erişebilir.",
  })
  @ApiResponse({ status: 200, description: "Detay döner." })
  @ApiResponse({ status: 404, description: "Tenant bulunamadı." })
  public async detail(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<TenantDetailResponse> {
    return this.service.getTenantDetail(id);
  }

  /**
   * Tenant'ın son audit event'leri.
   */
  @Get(":id/events")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "superadminTenantEvents",
    summary: "Tenant'ın son audit event'leri (SUPERADMIN)",
    description:
      "Belirtilen tenant'ın son 10 audit event'ini tarih azalan sırada döner.",
  })
  @ApiResponse({ status: 200, description: "Event listesi döner." })
  @ApiResponse({ status: 404, description: "Tenant bulunamadı." })
  public async events(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<{ items: AuditEventSummary[] }> {
    const items = await this.service.getRecentEvents(id, 10);
    return { items };
  }
}
