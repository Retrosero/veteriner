/**
 * @file SurgeryPlan controller.
 * @module apps/api/modules/surgery-plans/surgery-plans.controller
 *
 * @description GOAL-080 (FAZ-8) ameliyat planlama REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/surgery-plans`              — Yeni plan
 * - `GET    /api/v1/clinic/surgery-plans`              — Arama
 * - `GET    /api/v1/clinic/surgery-plans/:id`          — Detay
 * - `PATCH  /api/v1/clinic/surgery-plans/:id`          — Güncelle
 * - `POST   /api/v1/clinic/surgery-plans/:id/start`    — Başlat
 * - `POST   /api/v1/clinic/surgery-plans/:id/complete` — Tamamla
 * - `POST   /api/v1/clinic/surgery-plans/:id/cancel`   — İptal
 *
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
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
  surgeryPlanCancelInputSchema,
  surgeryPlanCreateInputSchema,
  surgeryPlanFiltersSchema,
  surgeryPlanUpdateInputSchema,
  type SurgeryPlan,
  type SurgeryPlanCancelInput,
  type SurgeryPlanCreateInput,
  type SurgeryPlanFilters,
  type SurgeryPlanListResponse,
  type SurgeryPlanUpdateInput,
} from "@vetniva/contracts";

import { SurgeryPlansService } from "./surgery-plans.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/surgery-plans")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/surgery-plans")
export class SurgeryPlansController {
  public constructor(private readonly service: SurgeryPlansService) {}

  @Post()
  @RequirePermissions("clinic:surgery:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "surgeryPlanCreate",
    summary: "Yeni ameliyat planı",
    description:
      "Hasta için planlanmış ameliyat kaydı. scheduledAt " +
      "gelecekte olmalı (422 VET-SURGERY-0006).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(surgeryPlanCreateInputSchema))
    body: SurgeryPlanCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<SurgeryPlan> {
    const tenantId = this.requireTenant(actor);
    return this.service.createPlan(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:surgery:read")
  @ApiOperation({
    operationId: "surgeryPlanList",
    summary: "Ameliyat planı arama",
    description:
      "Tenant-scoped arama. status/patientId/leadSurgeonUserId/" +
      "from/to/sort filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(surgeryPlanFiltersSchema))
    query: SurgeryPlanFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<SurgeryPlanListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listPlans(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:surgery:read")
  @ApiOperation({
    operationId: "surgeryPlanGetById",
    summary: "Ameliyat planı detayı",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<SurgeryPlan> {
    const tenantId = this.requireTenant(actor);
    const plan = await this.service.getPlanDetail(tenantId, id, actor);
    if (!plan) {
      throw new DomainError({
        errorCode: "VET-SURGERY-0001",
        message: "Ameliyat planı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SURGERY-0001",
      });
    }
    return plan;
  }

  @Patch(":id")
  @RequirePermissions("clinic:surgery:create")
  @ApiOperation({
    operationId: "surgeryPlanUpdate",
    summary: "Planlanmış ameliyat düzenleme",
    description: "Yalnızca `scheduled` durumdaki planlar düzenlenebilir.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(surgeryPlanUpdateInputSchema))
    body: SurgeryPlanUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<SurgeryPlan> {
    const tenantId = this.requireTenant(actor);
    return this.service.updatePlan(tenantId, id, body, actor);
  }

  @Post(":id/start")
  @RequirePermissions("clinic:surgery:start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "surgeryPlanStart",
    summary: "Ameliyat başlatma",
    description:
      "scheduled → in_progress. Yalnızca scheduled durumdaki " +
      "planlar başlatılabilir.",
  })
  public async start(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<SurgeryPlan> {
    const tenantId = this.requireTenant(actor);
    return this.service.startPlan(tenantId, id, actor);
  }

  @Post(":id/complete")
  @RequirePermissions("clinic:surgery:complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "surgeryPlanComplete",
    summary: "Ameliyat tamamlama",
    description:
      "in_progress → completed. Yalnızca devam eden planlar " +
      "tamamlanabilir.",
  })
  public async complete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<SurgeryPlan> {
    const tenantId = this.requireTenant(actor);
    return this.service.completePlan(tenantId, id, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("clinic:surgery:cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "surgeryPlanCancel",
    summary: "Ameliyat iptali",
    description:
      "scheduled/in_progress → cancelled. completed iptal " +
      "edilemez (409 VET-SURGERY-0007). İptal nedeni zorunlu.",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(surgeryPlanCancelInputSchema))
    body: SurgeryPlanCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<SurgeryPlan> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelPlan(tenantId, id, body, actor);
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
