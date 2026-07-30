/**
 * @file Prescription (reçete) controller.
 * @module apps/api/modules/prescriptions/prescriptions.controller
 *
 * @description GOAL-045 reçete REST API. Tenant ID URL'de taşınmaz;
 * actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/examinations/:id/prescriptions` — Yeni reçete
 * - `GET  /api/v1/clinic/prescriptions/:id`              — Detay
 * - `GET  /api/v1/clinic/prescriptions`                 — Liste + filtre
 * - `POST /api/v1/clinic/prescriptions/:id/dispense`     — Dağıt
 * - `POST /api/v1/clinic/prescriptions/:id/cancel`       — İptal
 * - `GET  /api/v1/clinic/prescriptions/:id/pdf`          — PDF (placeholder)
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type {
  Prescription,
  PrescriptionCancelInput,
  PrescriptionCreateInput,
  PrescriptionFilters,
  PrescriptionListResponse,
} from "@vetniva/contracts";
import {
  prescriptionCancelInputSchema,
  prescriptionCreateInputSchema,
  prescriptionFiltersSchema,
} from "@vetniva/contracts";

import { PrescriptionsService } from "./prescriptions.service.js";

@ApiTags("prescriptions")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class PrescriptionsController {
  public constructor(private readonly service: PrescriptionsService) {}

  // -------------------------------------------------------------------------
  // Examination-scoped
  // -------------------------------------------------------------------------

  @Post("examinations/:id/prescriptions")
  @RequirePermissions("clinic:prescription:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "prescriptionCreate",
    summary: "Yeni reçete oluştur",
    description:
      "Examination aynı tenant'ta mı kontrolünden sonra reçete " +
      "oluşturur. items en az 1 kalem içermelidir (boş → 422). " +
      "durationDays 1-30 gün arası (aşımı → 422 VET-VALIDATION-0010). " +
      "expiresAt = now + durationDays gün. status='active'.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Examination bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz input." })
  public async create(
    @Param("id") examinationId: string,
    @Body(new ZodValidationPipe(prescriptionCreateInputSchema))
    body: Omit<PrescriptionCreateInput, "examinationId">,
    @CurrentActor() actor: ActorContext,
  ): Promise<Prescription> {
    const tenantId = this.requireTenant(actor);
    return this.service.create(
      tenantId,
      { ...body, examinationId },
      actor,
    );
  }

  // -------------------------------------------------------------------------
  // Prescription-scoped
  // -------------------------------------------------------------------------

  @Get("prescriptions/:id")
  @RequirePermissions("clinic:prescription:read")
  @ApiOperation({
    operationId: "prescriptionGetById",
    summary: "Reçete detayı",
    description: "ID'ye göre reçete getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Prescription> {
    const tenantId = this.requireTenant(actor);
    const prsc = await this.service.findById(tenantId, id, actor);
    if (!prsc) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Reçete bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return prsc;
  }

  @Get("prescriptions")
  @RequirePermissions("clinic:prescription:read")
  @ApiOperation({
    operationId: "prescriptionList",
    summary: "Reçete listesi",
    description:
      "patientId / status / from / to / limit / offset filtreleri ile " +
      "tenant-scoped arama.",
  })
  public async list(
    @Query(new ZodValidationPipe(prescriptionFiltersSchema))
    query: PrescriptionFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<PrescriptionListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  @Post("prescriptions/:id/dispense")
  @RequirePermissions("clinic:prescription:dispense")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "prescriptionDispense",
    summary: "Reçeteyi dağıt",
    description:
      "status='active' olan reçeteyi 'dispensed' yapar; dispensedAt + " +
      "dispensedBy set edilir. Aksi durumda → 409 VET-PRESC-0003.",
  })
  public async dispense(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Prescription> {
    const tenantId = this.requireTenant(actor);
    return this.service.dispense(tenantId, id, actor);
  }

  @Post("prescriptions/:id/cancel")
  @RequirePermissions("clinic:prescription:cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "prescriptionCancel",
    summary: "Reçeteyi iptal et",
    description:
      "status='active' olan reçeteyi 'cancelled' yapar; cancelReason " +
      "kaydedilir. Zaten iptal edilmişse → 409 VET-PRESC-0004.",
  })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(prescriptionCancelInputSchema))
    body: PrescriptionCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Prescription> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancel(tenantId, id, body, actor);
  }

  @Get("prescriptions/:id/pdf")
  @RequirePermissions("clinic:prescription:read")
  @Header("Content-Type", "text/plain; charset=utf-8")
  @ApiOperation({
    operationId: "prescriptionPdf",
    summary: "Reçete PDF (placeholder)",
    description:
      "FAZ-0'da text/plain placeholder buffer döner. Gerçek PDF render " +
      "FAZ-10+'da.",
  })
  public async pdf(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    const buf = await this.service.pdf(tenantId, id, actor);
    res.status(HttpStatus.OK);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="prescription-${id}.txt"`,
    );
    res.setHeader("Content-Length", String(buf.length));
    res.send(buf);
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
