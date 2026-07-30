/**
 * @file Vaccine (aşı protokolü) controller.
 * @module apps/api/modules/vaccines/vaccines.controller
 *
 * @description GOAL-050 aşı kataloğu ve protokolleri REST API. Tenant
 * ID URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 * koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/vaccines/protocols`           — Yeni protokol
 * - `GET    /api/v1/clinic/vaccines/protocols`           — Liste + filtre
 * - `GET    /api/v1/clinic/vaccines/protocols/:id`       — Detay
 * - `PATCH  /api/v1/clinic/vaccines/protocols/:id`       — Güncelle
 * - `DELETE /api/v1/clinic/vaccines/protocols/:id`       — Arşivle (soft)
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import type {
  VaccineProtocol,
  VaccineProtocolCreateInput,
  VaccineProtocolFilters,
  VaccineProtocolListResponse,
  VaccineProtocolUpdateInput,
} from "@vetniva/contracts";
import {
  vaccineProtocolCreateInputSchema,
  vaccineProtocolFiltersSchema,
  vaccineProtocolUpdateInputSchema,
} from "@vetniva/contracts";

import { VaccinesService } from "./vaccines.service.js";

@ApiTags("vaccines")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class VaccinesController {
  public constructor(private readonly service: VaccinesService) {}

  // -------------------------------------------------------------------------
  // Collection
  // -------------------------------------------------------------------------

  @Post("vaccines/protocols")
  @RequirePermissions("clinic:vaccination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "vaccineProtocolCreate",
    summary: "Yeni aşı protokolü oluştur",
    description:
      "species + category + steps ile yeni bir aşı takvimi oluşturur. " +
      "steps en az 1 adım içermelidir (boş → 422 VET-VALIDATION-0010). " +
      "isCore alanı `category='core'` ise otomatik true yapılır; " +
      "totalDurationMonths son step'ten türetilir. Audit " +
      "`audit:vaccine.protocol.create` (info).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 422, description: "Geçersiz input." })
  public async createProtocol(
    @Body(new ZodValidationPipe(vaccineProtocolCreateInputSchema))
    body: VaccineProtocolCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineProtocol> {
    const tenantId = this.requireTenant(actor);
    return this.service.createProtocol(tenantId, body, actor);
  }

  @Get("vaccines/protocols")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineProtocolList",
    summary: "Aşı protokolü listesi",
    description:
      "species / category / isCore filtreleri ile tenant-scoped arama. " +
      "Arşivlenmiş kayıtlar dönmez.",
  })
  public async listProtocols(
    @Query(new ZodValidationPipe(vaccineProtocolFiltersSchema))
    query: VaccineProtocolFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineProtocolListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listProtocols(tenantId, query, actor);
  }

  // -------------------------------------------------------------------------
  // Single
  // -------------------------------------------------------------------------

  @Get("vaccines/protocols/:id")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineProtocolGetById",
    summary: "Aşı protokolü detayı",
    description: "ID'ye göre aşı protokolü getirir. Cross-tenant → 404.",
  })
  public async getProtocol(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineProtocol> {
    const tenantId = this.requireTenant(actor);
    const p = await this.service.getProtocol(tenantId, id, actor);
    if (!p) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı protokolü bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return p;
  }

  @Patch("vaccines/protocols/:id")
  @RequirePermissions("tenant:tenant:update")
  @ApiOperation({
    operationId: "vaccineProtocolUpdate",
    summary: "Aşı protokolü güncelle",
    description:
      "Kısmi güncelleme; yalnızca gönderilen alanlar değişir. " +
      "category değişirse isCore yeniden türetilir; steps değişirse " +
      "totalDurationMonths yeniden hesaplanır. Arşivlenmiş protokol " +
      "güncellenemez (409 VET-VACC-0001).",
  })
  public async updateProtocol(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(vaccineProtocolUpdateInputSchema))
    body: VaccineProtocolUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineProtocol> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateProtocol(tenantId, id, body, actor);
  }

  @Delete("vaccines/protocols/:id")
  @RequirePermissions("tenant:tenant:update")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "vaccineProtocolArchive",
    summary: "Aşı protokolünü arşivle (soft delete)",
    description:
      "archivedAt alanını set eder. Fiziksel silme YOKTUR (klinik " +
      "kayıt politikası). Zaten arşivlenmişse 409 VET-VACC-0002.",
  })
  public async archiveProtocol(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    await this.service.archiveProtocol(tenantId, id, actor);
  }

  // -------------------------------------------------------------------------
  // Helpers
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
