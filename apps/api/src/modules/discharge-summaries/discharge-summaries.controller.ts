/**
 * @file DischargeSummaries controller.
 * @module apps/api/modules/discharge-summaries/discharge-summaries.controller
 *
 * @description GOAL-086 (FAZ-8) gözlem + taburcu özeti REST
 * API. Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler — Observation (yatanın gözlemleri):
 * - `POST /api/v1/clinic/hospitalizations/:hospitalizationId/observations` — Ekle
 * - `GET  /api/v1/clinic/hospitalizations/:hospitalizationId/observations` — Arama
 *
 * Endpoint'ler — DischargeSummary (taburcu özeti):
 * - `POST /api/v1/clinic/hospitalizations/:hospitalizationId/discharge-summary`             — Oluştur (draft)
 * - `GET  /api/v1/clinic/hospitalizations/:hospitalizationId/discharge-summary`             — Detay
 * - `PATCH /api/v1/clinic/hospitalizations/:hospitalizationId/discharge-summary`            — Güncelle (draft)
 * - `POST /api/v1/clinic/hospitalizations/:hospitalizationId/discharge-summary/finalize`   — Finalize
 * - `POST /api/v1/clinic/hospitalizations/:hospitalizationId/discharge-summary/amend`      — Amendment
 * - `POST /api/v1/clinic/hospitalizations/:hospitalizationId/discharge-summary/portal-share` — Portal paylaşımı
 *
 * @since GOAL-086 (FAZ-8) gözlem ve taburcu özeti core
 */

import {
  Body,
  Controller,
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
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  dischargeSummaryAmendInputSchema,
  dischargeSummaryCreateInputSchema,
  dischargeSummaryFinalizeInputSchema,
  dischargeSummaryUpdateInputSchema,
  observationCreateInputSchema,
  observationFiltersSchema,
  type DischargeSummary,
  type DischargeSummaryAmendInput,
  type DischargeSummaryCreateInput,
  type DischargeSummaryFinalizeInput,
  type DischargeSummaryUpdateInput,
  type Observation,
  type ObservationCreateInput,
  type ObservationFilters,
  type ObservationListResponse,
} from "@vetniva/contracts";

import { DischargeSummariesService } from "./discharge-summaries.service.js";

@ApiTags("clinic/discharge-summaries")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/hospitalizations/:hospitalizationId")
export class DischargeSummariesController {
  public constructor(
    private readonly service: DischargeSummariesService,
  ) {}

  // ===========================================================================
  // OBSERVATION
  // ===========================================================================

  @Post("observations")
  @RequirePermissions("clinic:hospitalization:add_note")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "observationCreate",
    summary: "Yatışa gözlem kaydı ekle",
    description:
      "Append-only. Yatış discharged/cancelled değilse 422 VET-DSUM-0003.",
  })
  public async addObservation(
    @Param("hospitalizationId") hospitalizationId: string,
    @Body(new ZodValidationPipe(observationCreateInputSchema))
    body: ObservationCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Observation> {
    const tenantId = this.requireTenant(actor);
    return this.service.addObservation(tenantId, hospitalizationId, body, actor);
  }

  @Get("observations")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "observationList",
    summary: "Yatışın gözlem kayıtları",
    description: "kind/from/to/sort filtreleri.",
  })
  public async listObservations(
    @Param("hospitalizationId") hospitalizationId: string,
    @Query(new ZodValidationPipe(observationFiltersSchema))
    query: ObservationFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ObservationListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listObservations(
      tenantId,
      { ...query, hospitalizationId },
      actor,
    );
  }

  // ===========================================================================
  // DISCHARGE SUMMARY
  // ===========================================================================

  @Post("discharge-summary")
  @RequirePermissions("clinic:hospitalization:discharge")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "dischargeSummaryCreate",
    summary: "Taburcu özeti oluştur (draft)",
    description:
      "Yatış discharged olmalı (422 VET-DSUM-0004). Aynı yatış için " +
      "aktif (draft/finalized) özet varsa 409 VET-DSUM-0005.",
  })
  public async createSummary(
    @Param("hospitalizationId") hospitalizationId: string,
    @Body(new ZodValidationPipe(dischargeSummaryCreateInputSchema))
    body: DischargeSummaryCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<DischargeSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.createDischargeSummary(
      tenantId,
      hospitalizationId,
      body,
      actor,
    );
  }

  @Get("discharge-summary")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "dischargeSummaryGet",
    summary: "Taburcu özeti detayı",
    description: "Cross-tenant → 404.",
  })
  public async getSummary(
    @Param("hospitalizationId") hospitalizationId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<DischargeSummary> {
    const tenantId = this.requireTenant(actor);
    const summary = await this.service.getDischargeSummary(
      tenantId,
      hospitalizationId,
      actor,
    );
    if (!summary) {
      throw new DomainError({
        errorCode: "VET-DSUM-0002",
        message: "Taburcu özeti bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-DSUM-0002",
      });
    }
    return summary;
  }

  @Patch("discharge-summary")
  @RequirePermissions("clinic:hospitalization:discharge")
  @ApiOperation({
    operationId: "dischargeSummaryUpdate",
    summary: "Taburcu özeti güncelle (draft)",
    description:
      "Finalized/amended düzenlenemez (409 VET-DSUM-0006).",
  })
  public async updateSummary(
    @Param("hospitalizationId") hospitalizationId: string,
    @Body(new ZodValidationPipe(dischargeSummaryUpdateInputSchema))
    body: DischargeSummaryUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<DischargeSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateDischargeSummary(
      tenantId,
      hospitalizationId,
      body,
      actor,
    );
  }

  @Post("discharge-summary/finalize")
  @RequirePermissions("clinic:hospitalization:discharge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "dischargeSummaryFinalize",
    summary: "Taburcu özetini finalize et (draft → finalized)",
    description:
      "PDF üretildi flag'i set edilir (gerçek üretim worker'da). " +
      "Yalnızca draft (409 VET-DSUM-0006).",
  })
  public async finalizeSummary(
    @Param("hospitalizationId") hospitalizationId: string,
    @Body(new ZodValidationPipe(dischargeSummaryFinalizeInputSchema))
    body: DischargeSummaryFinalizeInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<DischargeSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.finalizeDischargeSummary(
      tenantId,
      hospitalizationId,
      body,
      actor,
    );
  }

  @Post("discharge-summary/amend")
  @RequirePermissions("clinic:hospitalization:discharge")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "dischargeSummaryAmend",
    summary: "Amendment (finalize sonrası düzeltme)",
    description:
      "Orijinal amended işaretlenir; yeni revision (draft) oluşur. " +
      "Yalnızca finalized (409 VET-DSUM-0008).",
  })
  public async amendSummary(
    @Param("hospitalizationId") hospitalizationId: string,
    @Body(new ZodValidationPipe(dischargeSummaryAmendInputSchema))
    body: DischargeSummaryAmendInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<DischargeSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.amendDischargeSummary(
      tenantId,
      hospitalizationId,
      body,
      actor,
    );
  }

  @Post("discharge-summary/portal-share")
  @RequirePermissions("clinic:hospitalization:discharge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "dischargeSummaryPortalShare",
    summary: "Portal paylaşımı (finalized → portalShared=true)",
    description: "Yalnızca finalized (409 VET-DSUM-0007).",
  })
  public async portalShare(
    @Param("hospitalizationId") hospitalizationId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<DischargeSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.shareDischargeSummaryPortal(
      tenantId,
      hospitalizationId,
      actor,
    );
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
