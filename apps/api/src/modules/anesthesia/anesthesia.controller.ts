/**
 * @file Anesthesia controller.
 * @module apps/api/modules/anesthesia/anesthesia.controller
 * @description GOAL-082 (FAZ-8) anestezi takip REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST  /api/v1/clinic/anesthesia`                                — Yeni takip (plan in_progress)
 * - `GET   /api/v1/clinic/anesthesia`                                — Arama
 * - `GET   /api/v1/clinic/anesthesia/:id`                            — Detay + alt kayıtlar
 * - `POST  /api/v1/clinic/anesthesia/:id/medications`                — İlaç ekle (draft)
 * - `POST  /api/v1/clinic/anesthesia/:id/vitals`                     — Vital ekle (draft)
 * - `POST  /api/v1/clinic/anesthesia/:id/complications`              — Komplikasyon ekle (draft)
 * - `POST  /api/v1/clinic/anesthesia/:id/staff`                      — Personel ata (draft)
 * - `POST  /api/v1/clinic/anesthesia/:id/finalize`                   — Finalize.
 * @since GOAL-082 (FAZ-8) anestezi takip core
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
import {
  anesthesiaComplicationInputSchema,
  anesthesiaCreateInputSchema,
  anesthesiaFiltersSchema,
  anesthesiaFinalizeInputSchema,
  anesthesiaMedicationInputSchema,
  anesthesiaStaffInputSchema,
  anesthesiaVitalInputSchema,
  type Anesthesia,
  type AnesthesiaComplication,
  type AnesthesiaComplicationInput,
  type AnesthesiaCreateInput,
  type AnesthesiaDetail,
  type AnesthesiaFilters,
  type AnesthesiaFinalizeInput,
  type AnesthesiaListResponse,
  type AnesthesiaMedication,
  type AnesthesiaMedicationInput,
  type AnesthesiaStaff,
  type AnesthesiaStaffInput,
  type AnesthesiaVital,
  type AnesthesiaVitalInput,
} from "@vetniva/contracts";

import { AnesthesiaService } from "./anesthesia.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/anesthesia")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/anesthesia")
export class AnesthesiaController {
  public constructor(private readonly service: AnesthesiaService) {}

  @Post()
  @RequirePermissions("clinic:anesthesia:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "anesthesiaCreate",
    summary: "Yeni anestezi takip kaydı",
    description:
      "Bir ameliyat planı için anestezi takibi açar. Plan " +
      "in_progress olmalı (422 VET-ANESTHESIA-0003). Aynı plan " +
      "için ikinci kayıt reddedilir (409 VET-ANESTHESIA-0004).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(anesthesiaCreateInputSchema))
    body: AnesthesiaCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Anesthesia> {
    const tenantId = this.requireTenant(actor);
    return this.service.createAnesthesia(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:anesthesia:read")
  @ApiOperation({
    operationId: "anesthesiaList",
    summary: "Anestezi takip arama",
    description: "Tenant-scoped arama. status/patientId/surgeryPlanId/sort.",
  })
  public async list(
    @Query(new ZodValidationPipe(anesthesiaFiltersSchema))
    query: AnesthesiaFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnesthesiaListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listAnesthesias(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:anesthesia:read")
  @ApiOperation({
    operationId: "anesthesiaGetById",
    summary: "Anestezi detayı (alt kayıtlar dahil)",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnesthesiaDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getAnesthesiaDetail(tenantId, id, actor);
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-ANESTHESIA-0001",
        message: "Anestezi kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-ANESTHESIA-0001",
      });
    }
    return detail;
  }

  @Post(":id/medications")
  @RequirePermissions("clinic:anesthesia:update")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "anesthesiaAddMedication",
    summary: "İlaç uygulama kaydı ekle",
    description: "Yalnızca draft durumda (409 VET-ANESTHESIA-0002).",
  })
  public async addMedication(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(anesthesiaMedicationInputSchema))
    body: AnesthesiaMedicationInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnesthesiaMedication> {
    const tenantId = this.requireTenant(actor);
    return this.service.addMedication(tenantId, id, body, actor);
  }

  @Post(":id/vitals")
  @RequirePermissions("clinic:anesthesia:update")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "anesthesiaAddVital",
    summary: "Vital bulgu kaydı ekle",
    description: "Yalnızca draft durumda (409 VET-ANESTHESIA-0002).",
  })
  public async addVital(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(anesthesiaVitalInputSchema))
    body: AnesthesiaVitalInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnesthesiaVital> {
    const tenantId = this.requireTenant(actor);
    return this.service.addVital(tenantId, id, body, actor);
  }

  @Post(":id/complications")
  @RequirePermissions("clinic:anesthesia:update")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "anesthesiaAddComplication",
    summary: "Komplikasyon kaydı ekle",
    description: "Yalnızca draft durumda (409 VET-ANESTHESIA-0002).",
  })
  public async addComplication(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(anesthesiaComplicationInputSchema))
    body: AnesthesiaComplicationInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnesthesiaComplication> {
    const tenantId = this.requireTenant(actor);
    return this.service.addComplication(tenantId, id, body, actor);
  }

  @Post(":id/staff")
  @RequirePermissions("clinic:anesthesia:update")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "anesthesiaAssignStaff",
    summary: "Sorumlu personel atama",
    description: "Yalnızca draft durumda (409 VET-ANESTHESIA-0002).",
  })
  public async assignStaff(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(anesthesiaStaffInputSchema))
    body: AnesthesiaStaffInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnesthesiaStaff> {
    const tenantId = this.requireTenant(actor);
    return this.service.assignStaff(tenantId, id, body, actor);
  }

  @Post(":id/finalize")
  @RequirePermissions("clinic:anesthesia:update")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "anesthesiaFinalize",
    summary: "Anestezi takibini finalize et",
    description:
      "draft → finalized. Alt kayıtlar append-only olur. " +
      "Zaten finalize edilmişse 409 VET-ANESTHESIA-0002.",
  })
  public async finalize(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(anesthesiaFinalizeInputSchema))
    body: AnesthesiaFinalizeInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Anesthesia> {
    const tenantId = this.requireTenant(actor);
    return this.service.finalizeAnesthesia(tenantId, id, body, actor);
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
