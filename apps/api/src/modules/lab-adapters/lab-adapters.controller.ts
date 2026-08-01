/**
 * @file Lab adapter controller.
 * @module apps/api/modules/lab-adapters/lab-adapters.controller
 *
 * @description GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter
 *   REST API. Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/lab-orders/:labOrderId/adapter-exports`  — Export başlat
 * - `GET    /api/v1/clinic/lab-adapter-exports`                     — Export arama
 * - `GET    /api/v1/clinic/lab-adapter-exports/:id`                 — Export detay
 * - `POST   /api/v1/clinic/lab-adapter-exports/:id/retry`          — Yeniden dene
 * - `POST   /api/v1/clinic/lab-adapter-exports/:id/cancel`         — İptal
 * - `POST   /api/v1/clinic/lab-orders/:labOrderId/adapter-imports`  — Sonuç import
 * - `GET    /api/v1/clinic/lab-adapter-imports`                     — Import arama
 * - `GET    /api/v1/clinic/lab-adapter-imports/:id`                 — Import detay
 * - `GET    /api/v1/clinic/lab-adapters`                            — Adapter listesi
 *
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
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
  labAdapterExportCancelInputSchema,
  labAdapterExportCreateInputSchema,
  labAdapterExportFiltersSchema,
  labAdapterImportCreateInputSchema,
  labAdapterImportFiltersSchema,
  type LabAdapterExport,
  type LabAdapterExportCancelInput,
  type LabAdapterExportCreateInput,
  type LabAdapterExportFilters,
  type LabAdapterExportListResponse,
  type LabAdapterImport,
  type LabAdapterImportCreateInput,
  type LabAdapterImportFilters,
  type LabAdapterImportListResponse,
  type LabAdapterInfo,
} from "@vetniva/contracts";

import { LabAdaptersService } from "./lab-adapters.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/lab-adapters")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class LabAdaptersController {
  public constructor(private readonly service: LabAdaptersService) {}

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  @Post("lab-orders/:labOrderId/adapter-exports")
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "labAdapterExportCreate",
    summary: "Lab order'ı adapter'a export et",
    description:
      "İdempotency key zorunlu. Mock adapter aynı key ile duplicate üretmez. " +
      "Accepted ise yeni export reddedilir (409 VET-LABADAPTER-0006).",
  })
  @ApiResponse({ status: 201, description: "Export denemesi oluşturuldu." })
  public async createExport(
    @Param("labOrderId", new ParseUUIDPipe()) labOrderId: string,
    @Body(new ZodValidationPipe(labAdapterExportCreateInputSchema))
    body: LabAdapterExportCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterExport> {
    const tenantId = this.requireTenant(actor);
    return this.service.exportOrder(tenantId, labOrderId, body, actor);
  }

  @Get("lab-adapter-exports")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labAdapterExportList",
    summary: "Export arama",
    description: "Tenant-scoped. labOrderId/adapterType/status filtreleri.",
  })
  public async listExports(
    @Query(new ZodValidationPipe(labAdapterExportFiltersSchema))
    query: LabAdapterExportFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterExportListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listExports(tenantId, query, actor);
  }

  @Get("lab-adapter-exports/:id")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labAdapterExportGetById",
    summary: "Export detayı",
    description: "Cross-tenant → 404.",
  })
  public async getExport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterExport> {
    const tenantId = this.requireTenant(actor);
    const exp = await this.service.getExport(tenantId, id, actor);
    if (!exp) {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0001",
        message: "Export kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0001",
      });
    }
    return exp;
  }

  @Post("lab-adapter-exports/:id/retry")
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labAdapterExportRetry",
    summary: "Export yeniden dene",
    description:
      "Yalnızca failed/rejected durumdaki export'lar retry edilebilir (409 VET-LABADAPTER-0007).",
  })
  public async retryExport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterExport> {
    const tenantId = this.requireTenant(actor);
    return this.service.retryExport(tenantId, id, actor);
  }

  @Post("lab-adapter-exports/:id/cancel")
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labAdapterExportCancel",
    summary: "Export iptal",
    description:
      "pending/failed → cancelled. accepted (provider kabul etti) iptal edilemez (409 VET-LABADAPTER-0008).",
  })
  public async cancelExport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(labAdapterExportCancelInputSchema))
    body: LabAdapterExportCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterExport> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelExport(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------

  @Post("lab-orders/:labOrderId/adapter-imports")
  @RequirePermissions("clinic:lab:enter_result")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "labAdapterImportCreate",
    summary: "Adapter'dan sonuç import",
    description:
      "Adapter'dan sonucu çeker; order processing/completed ise ve rawPayload " +
      "içinde readings varsa otomatik labResult oluşturulur (status=applied).",
  })
  @ApiResponse({ status: 201, description: "Import kaydı oluşturuldu." })
  public async createImport(
    @Param("labOrderId", new ParseUUIDPipe()) labOrderId: string,
    @Body(new ZodValidationPipe(labAdapterImportCreateInputSchema))
    body: LabAdapterImportCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterImport> {
    const tenantId = this.requireTenant(actor);
    return this.service.importResult(tenantId, labOrderId, body, actor);
  }

  @Get("lab-adapter-imports")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labAdapterImportList",
    summary: "Import arama",
    description: "Tenant-scoped. labOrderId/adapterType/status filtreleri.",
  })
  public async listImports(
    @Query(new ZodValidationPipe(labAdapterImportFiltersSchema))
    query: LabAdapterImportFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterImportListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listImports(tenantId, query, actor);
  }

  @Get("lab-adapter-imports/:id")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labAdapterImportGetById",
    summary: "Import detayı",
    description: "Cross-tenant → 404.",
  })
  public async getImport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterImport> {
    const tenantId = this.requireTenant(actor);
    const imp = await this.service.getImport(tenantId, id, actor);
    if (!imp) {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0005",
        message: "Import kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0005",
      });
    }
    return imp;
  }

  // -------------------------------------------------------------------------
  // Adapter list
  // -------------------------------------------------------------------------

  @Get("lab-adapters")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labAdapterList",
    summary: "Yapılandırılmış adapter listesi",
    description: "Tenant-a tanımlı tüm adapter'lar (MVP: iki mock).",
  })
  public async listAdapters(
    @CurrentActor() actor: ActorContext,
  ): Promise<LabAdapterInfo[]> {
    this.requireTenant(actor);
    return this.service.listAdapters();
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
