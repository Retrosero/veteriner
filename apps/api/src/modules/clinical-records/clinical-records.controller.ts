/**
 * @file Clinical records controller.
 * @module apps/api/modules/clinical-records/clinical-records.controller
 *
 * @description GOAL-047 klinik kayıt PDF ve paylaşım REST API. Tenant
 * ID URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 * koruması).
 *
 * Endpoint'ler:
 * - `GET  /api/v1/clinic/examinations/:id/pdf`    — PDF render
 * - `POST /api/v1/clinic/examinations/:id/share`  — Hasta ile paylaş
 * - `GET  /api/v1/clinic/examinations/:id/shares` — Paylaşım listesi
 * - `DELETE /api/v1/clinic/shares/:shareId`       — Paylaşım iptal
 *
 * @since GOAL-047 (FAZ-4) klinik kayıt PDF ve paylaşım core
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  ClinicalRecordShare,
  ClinicalRecordShareList,
  ClinicalRecordShareRequest,
} from "@vetniva/contracts";
import { clinicalRecordShareRequestSchema } from "@vetniva/contracts";

import { ClinicalRecordsService } from "./clinical-records.service.js";

@ApiTags("clinical-records")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class ClinicalRecordsController {
  public constructor(private readonly service: ClinicalRecordsService) {}

  /**
   * Klinik kayıt PDF render. Tenant-scoped; cross-tenant → 404.
   * Yanıt binary `text/plain` buffer olarak döner (FAZ-0 stub;
   * production'da `application/pdf`).
   */
  @Get("examinations/:id/pdf")
  @RequirePermissions("clinic:examination:read")
  @Header("Content-Type", "text/plain; charset=utf-8")
  @ApiOperation({
    operationId: "clinicalRecordPdf",
    summary: "Klinik kayıt PDF render",
    description:
      "Examination + SOAP + Vitals + Diagnoses + Prescriptions + Orders + " +
      "Followups birleşik PDF. FAZ-0'da placeholder text; gerçek PDF FAZ-10+'da.",
  })
  @ApiResponse({ status: 200, description: "PDF buffer döner." })
  @ApiResponse({ status: 404, description: "Examination bulunamadı." })
  public async pdf(
    @Param("id") examinationId: string,
    @CurrentActor() actor: ActorContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const tenantId = this.requireTenant(actor);
    const result = await this.service.generatePdf(
      tenantId,
      examinationId,
      actor,
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="clinical-record-${examinationId}.txt"`,
    );
    res.setHeader("X-Document-Id", result.id);
    res.setHeader("X-Generated-At", result.generatedAt);
    return result.pdfBuffer;
  }

  /**
   * Klinik kayıt paylaşımı. PDF oluşturulur, dosya servisine yüklenir,
   * kanallar (e-posta/SMS/portal) üzerinden gönderilir ve 7 gün geçerli
   * share kaydı oluşturulur.
   */
  @Post("examinations/:id/share")
  @RequirePermissions("clinic:report:export")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "clinicalRecordShare",
    summary: "Klinik kayıt paylaşımı",
    description:
      "PDF render → dosya yükleme → kanallardan gönderim → 7 gün geçerli " +
      "share kaydı. `channels` en az 1 öğe (boş → 422).",
  })
  @ApiResponse({ status: 200, description: "Paylaşım oluşturuldu." })
  @ApiResponse({ status: 404, description: "Examination bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz kanal listesi." })
  public async share(
    @Param("id") examinationId: string,
    @Body(new ZodValidationPipe(clinicalRecordShareRequestSchema))
    body: ClinicalRecordShareRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<{
    shareId: string;
    expiresAt: string;
    sentChannels: ClinicalRecordShareRequest["channels"];
  }> {
    const tenantId = this.requireTenant(actor);
    return this.service.shareWithPatient(
      tenantId,
      examinationId,
      body.channels,
      actor,
    );
  }

  /**
   * Bir muayeneye ait paylaşım kayıtları (createdAt desc).
   */
  @Get("examinations/:id/shares")
  @RequirePermissions("clinic:examination:read")
  @ApiOperation({
    operationId: "clinicalRecordShareList",
    summary: "Paylaşım listesi",
    description: "Bir muayeneye ait tüm paylaşım kayıtlarını döner.",
  })
  public async listShares(
    @Param("id") examinationId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ClinicalRecordShareList> {
    const tenantId = this.requireTenant(actor);
    const items = await this.service.listShares(
      tenantId,
      examinationId,
      actor,
    );
    return { items };
  }

  /**
   * Share kaydını soft-delete yapar (`revokedAt` set). İdempotent.
   */
  @Delete("shares/:shareId")
  @RequirePermissions("clinic:report:export")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "clinicalRecordShareRevoke",
    summary: "Paylaşım iptal",
    description: "Share kaydını soft-delete yapar (idempotent).",
  })
  @ApiResponse({ status: 204, description: "İptal edildi." })
  @ApiResponse({ status: 404, description: "Paylaşım bulunamadı." })
  public async revoke(
    @Param("shareId") shareId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    await this.service.revokeShare(tenantId, shareId, actor);
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
