/**
 * @file SOAP (klinik kaydı) controller.
 * @module apps/api/modules/soap/soap.controller
 *
 * @description GOAL-041 SOAP REST API. Tenant ID URL'de taşınmaz;
 * actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/examinations/:id/soap`       — Yeni SOAP oluştur
 * - `GET  /api/v1/clinic/examinations/:id/soap`       — SOAP getir
 * - `PATCH /api/v1/clinic/examinations/:id/soap`      — SOAP güncelle (draft)
 * - `POST /api/v1/clinic/examinations/:id/soap/sign`  — SOAP imzala
 * - `POST /api/v1/clinic/examinations/:id/soap/amend` — SOAP düzelt (amend)
 *
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
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
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  soapAmendInputSchema,
  soapUpdateInputSchema,
} from "@vetniva/contracts";

import { SoapService } from "./soap.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  SoapAmendInput,
  SoapAmendRecord,
  SoapNote,
  SoapUpdateInput,
} from "@vetniva/contracts";

@ApiTags("soap")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/examinations")
export class SoapController {
  public constructor(private readonly service: SoapService) {}

  @Post(":id/soap")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "soapCreate",
    summary: "SOAP klinik kaydı oluştur",
    description:
      "Examination status=in_progress olmalı. Her bölüm (S/O/A/P) " +
      "opsiyonel. status='draft' olarak işaretlenir.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Muayene bulunamadı." })
  @ApiResponse({ status: 409, description: "Examination status uygun değil." })
  @ApiResponse({ status: 422, description: "Geçersiz input." })
  public async create(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(soapUpdateInputSchema))
    body: SoapUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<SoapNote> {
    const tenantId = this.requireTenant(actor);
    return this.service.create(tenantId, id, body, actor);
  }

  @Get(":id/soap")
  @RequirePermissions("clinic:examination:read")
  @ApiOperation({
    operationId: "soapGetByExamination",
    summary: "Examination SOAP notunu getir",
    description: "Examination'a bağlı SOAP notu. Cross-tenant → null.",
  })
  public async findByExamination(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<SoapNote> {
    const tenantId = this.requireTenant(actor);
    const soap = await this.service.findByExamination(tenantId, id, actor);
    if (!soap) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "SOAP notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return soap;
  }

  @Patch(":id/soap")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "soapUpdate",
    summary: "SOAP notu güncelle (yalnızca draft)",
    description:
      "Yalnızca status='draft' SOAP notu güncellenebilir. " +
      "İmza sonrası → 409 VET-SOAP-0001.",
  })
  public async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(soapUpdateInputSchema))
    body: SoapUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<SoapNote> {
    const tenantId = this.requireTenant(actor);
    return this.service.update(tenantId, id, body, actor);
  }

  @Post(":id/soap/sign")
  @RequirePermissions("clinic:examination:sign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "soapSign",
    summary: "SOAP notunu imzala",
    description:
      "status='draft' olan SOAP notunu 'signed' yapar; signedAt + " +
      "signedBy set edilir. Cross-service: muayene de imzalanır " +
      "(status=completed olmalı; aksi → 409 VET-EXAM-0002).",
  })
  public async sign(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<SoapNote> {
    const tenantId = this.requireTenant(actor);
    return this.service.sign(tenantId, id, actor);
  }

  @Post(":id/soap/amend")
  @RequirePermissions("clinic:examination:sign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "soapAmend",
    summary: "SOAP notunu düzelt (amend)",
    description:
      "İmza sonrası düzeltme için yeni SoapAmend kaydı oluşturur " +
      "(append-only). status='amended' yapılır; orijinal SOAP " +
      "bölümleri korunur, yeni içerik amend kaydında saklanır.",
  })
  public async amend(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(soapAmendInputSchema))
    body: SoapAmendInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ soap: SoapNote; amend: SoapAmendRecord }> {
    const tenantId = this.requireTenant(actor);
    return this.service.amend(tenantId, id, body, actor);
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
