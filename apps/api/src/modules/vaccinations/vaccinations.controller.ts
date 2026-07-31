/**
 * @file Vaccinations (aşı uygulama kaydı) controller.
 * @module apps/api/modules/vaccinations/vaccinations.controller
 *
 * @description GOAL-051 aşı uygulama kaydı REST API. Tenant ID
 * URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 * koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/vaccinations`                              — Yeni kayıt
 * - `GET  /api/v1/clinic/vaccinations?patientId&protocolId&status&from&to`
 *   — Liste + filtre
 * - `GET  /api/v1/clinic/vaccinations/:id`                          — Detay
 * - `GET  /api/v1/clinic/patients/:id/vaccinations/next-due`        — Gelecektekiler
 * - `GET  /api/v1/clinic/patients/:id/vaccinations/overdue`         — Geçmiştekiler
 * - `POST /api/v1/clinic/vaccinations/:id/cancel`  body: { reason } — İptal
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  Vaccination,
  VaccinationCancelInput,
  VaccinationCreateInput,
  VaccinationFilters,
  VaccinationListResponse,
} from "@vetniva/contracts";
import {
  vaccinationCancelInputSchema,
  vaccinationCreateInputSchema,
  vaccinationFiltersSchema,
} from "@vetniva/contracts";

import { VaccinationsService } from "./vaccinations.service.js";

@ApiTags("vaccinations")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class VaccinationsController {
  public constructor(
    private readonly service: VaccinationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Collection
  // -------------------------------------------------------------------------

  @Post("vaccinations")
  @RequirePermissions("clinic:vaccination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "vaccinationCreate",
    summary: "Yeni aşı uygulama kaydı oluştur",
    description:
      "Bir hayvana aşı uygulaması kaydeder. Hasta ve protokol " +
      "cross-tenant → 404. Lot numarası tenant + protokol " +
      "kapsamında tekil olmalı; duplicate → 409 VET-VACC-0003. " +
      "`nextDueAt` protokolün bir sonraki adımından türetilir. " +
      "Audit `audit:vaccination.create` (info).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Hasta veya protokol bulunamadı." })
  @ApiResponse({ status: 409, description: "Duplicate lot." })
  public async create(
    @Body(new ZodValidationPipe(vaccinationCreateInputSchema))
    body: VaccinationCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Vaccination> {
    const tenantId = this.requireTenant(actor);
    return this.service.record(tenantId, body, actor);
  }

  @Get("vaccinations")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccinationList",
    summary: "Aşı uygulama kayıtları listesi",
    description:
      "patientId / protocolId / status / from / to filtreleri ile " +
      "tenant-scoped arama. En yeni kayıt üstte.",
  })
  public async list(
    @Query(new ZodValidationPipe(vaccinationFiltersSchema))
    query: VaccinationFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccinationListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  // -------------------------------------------------------------------------
  // Single
  // -------------------------------------------------------------------------

  @Get("vaccinations/:id")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccinationGetById",
    summary: "Aşı uygulama kaydı detayı",
    description: "ID'ye göre aşı uygulama kaydı getirir. Cross-tenant → 404.",
  })
  public async getOne(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Vaccination> {
    const tenantId = this.requireTenant(actor);
    const v = await this.service.findById(tenantId, id, actor);
    if (!v) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return v;
  }

  @Post("vaccinations/:id/cancel")
  @RequirePermissions("clinic:vaccination:create")
  @ApiOperation({
    operationId: "vaccinationCancel",
    summary: "Aşı uygulama kaydını iptal et",
    description:
      "status='cancelled' olur. Zaten iptal edilmiş → 409 " +
      "VET-VACC-0008. Audit `audit:vaccination.cancel` (warning).",
  })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(vaccinationCancelInputSchema))
    body: VaccinationCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Vaccination> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancel(tenantId, id, body.reason, actor);
  }

  // -------------------------------------------------------------------------
  // Patient timeline helpers
  // -------------------------------------------------------------------------

  @Get("patients/:id/vaccinations/next-due")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccinationListNextDue",
    summary: "Hastanın gelecek tarihli aşı kayıtları",
    description:
      "status='administered' + nextDueAt gelecekte olanlar. " +
      "Cross-tenant → boş liste.",
  })
  public async nextDue(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Vaccination[]> {
    const tenantId = this.requireTenant(actor);
    return this.service.getNextDue(tenantId, id, actor);
  }

  @Get("patients/:id/vaccinations/overdue")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccinationListOverdue",
    summary: "Hastanın gecikmiş aşı kayıtları",
    description:
      "status='administered' + nextDueAt geçmişte olanlar. " +
      "Cross-tenant → boş liste.",
  })
  public async overdue(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Vaccination[]> {
    const tenantId = this.requireTenant(actor);
    return this.service.getOverdue(tenantId, id, actor);
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
