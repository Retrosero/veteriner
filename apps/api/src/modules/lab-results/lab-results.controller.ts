/**
 * @file Lab result controller.
 * @module apps/api/modules/lab-results/lab-results.controller
 *
 * @description GOAL-092 (FAZ-9) laboratuvar sonucu REST API.
 *   Lab order path parametre olarak kullanılır:
 *   `/api/v1/clinic/lab-orders/:orderId/result[/...]`.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/lab-orders/:orderId/result`       — Yeni taslak
 * - `GET    /api/v1/clinic/lab-orders/:orderId/result`       — Aktif sonuç
 * - `GET    /api/v1/clinic/lab-orders/:orderId/result/history` — Revizyonlar
 * - `PATCH  /api/v1/clinic/lab-orders/:orderId/result`       — Taslak güncelle
 * - `POST   /api/v1/clinic/lab-orders/:orderId/result/submit`  — İncelemeye
 * - `POST   /api/v1/clinic/lab-orders/:orderId/result/approve` — Onayla
 * - `POST   /api/v1/clinic/lab-orders/:orderId/result/amend`   — Düzelt
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
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
  labResultAmendInputSchema,
  labResultApproveInputSchema,
  labResultCreateInputSchema,
  labResultSubmitInputSchema,
  labResultUpdateInputSchema,
  type LabResult,
  type LabResultAmendInput,
  type LabResultApproveInput,
  type LabResultCreateInput,
  type LabResultListResponse,
  type LabResultSubmitInput,
  type LabResultUpdateInput,
} from "@vetniva/contracts";

import { LabResultsService } from "./lab-results.service.js";

@ApiTags("clinic/lab-results")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/lab-orders/:orderId/result")
export class LabResultsController {
  public constructor(
    private readonly service: LabResultsService,
  ) {}

  @Post()
  @RequirePermissions("clinic:lab:enter_result")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "labResultCreate",
    summary: "Yeni laboratuvar sonucu (taslak)",
    description:
      "Order processing veya completed olmalı. Mevcut aktif " +
      "sonuç 409 VET-LABRES-0003.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body(new ZodValidationPipe(labResultCreateInputSchema))
    body: LabResultCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabResult> {
    const tenantId = this.requireTenant(actor);
    return this.service.createLabResult(tenantId, orderId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labResultGetActive",
    summary: "Aktif sonucu getir",
    description: "Cross-tenant → 404.",
  })
  public async getActive(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabResult> {
    const tenantId = this.requireTenant(actor);
    const r = await this.service.getLabResultDetail(
      tenantId,
      orderId,
      actor,
    );
    if (!r) {
      throw new DomainError({
        errorCode: "VET-LABRES-0001",
        message: "Sonuç bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABRES-0001",
      });
    }
    return r;
  }

  @Get("history")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labResultListRevisions",
    summary: "Sonuç revizyonları (amendment geçmişi)",
  })
  public async listRevisions(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabResultListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listLabResultRevisions(tenantId, orderId, actor);
  }

  @Patch()
  @RequirePermissions("clinic:lab:enter_result")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labResultUpdate",
    summary: "Taslak sonucu kısmi güncelle",
    description: "Yalnızca draft durumda (409 VET-LABRES-0002).",
  })
  public async update(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body(new ZodValidationPipe(labResultUpdateInputSchema))
    body: LabResultUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabResult> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateLabResult(tenantId, orderId, body, actor);
  }

  @Post("submit")
  @RequirePermissions("clinic:lab:enter_result")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labResultSubmit",
    summary: "İncelemeye gönder",
    description: "draft → pending_review.",
  })
  public async submit(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body(new ZodValidationPipe(labResultSubmitInputSchema))
    body: LabResultSubmitInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabResult> {
    const tenantId = this.requireTenant(actor);
    return this.service.submitForReview(tenantId, orderId, body, actor);
  }

  @Post("approve")
  @RequirePermissions("clinic:lab:enter_result")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labResultApprove",
    summary: "Sonucu onayla (finalize)",
    description:
      "pending_review → approved. Onaylanmış sonuç değiştirilemez; " +
      "düzeltme `amend` ile yapılır.",
  })
  public async approve(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body(new ZodValidationPipe(labResultApproveInputSchema))
    body: LabResultApproveInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabResult> {
    const tenantId = this.requireTenant(actor);
    return this.service.approveLabResult(tenantId, orderId, body, actor);
  }

  @Post("amend")
  @RequirePermissions("clinic:lab:amend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labResultAmend",
    summary: "Onaylanmış sonucu amendment ile düzelt",
    description:
      "approved → amended (eski) + yeni draft revision.",
  })
  public async amend(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body(new ZodValidationPipe(labResultAmendInputSchema))
    body: LabResultAmendInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabResult> {
    const tenantId = this.requireTenant(actor);
    return this.service.amendLabResult(tenantId, orderId, body, actor);
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
