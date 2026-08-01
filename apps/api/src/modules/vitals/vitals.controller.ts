/**
 * @file Vitals (vital bulgular) controller.
 * @module apps/api/modules/vitals/vitals.controller
 *
 * @description GOAL-042 vital bulgular REST API. Tenant ID URL'de
 * taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/examinations/:id/vitals`           — Vital kaydet
 * - `GET  /api/v1/clinic/examinations/:id/vitals`           — Muayene vital listesi
 * - `GET  /api/v1/clinic/patients/:id/vitals/latest`        — Hastanın son vitalleri
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { vitalSignsCreateInputSchema } from "@vetniva/contracts";

import { VitalsService } from "./vitals.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { VitalSignsCreateInput, VitalsRecord } from "@vetniva/contracts";

@ApiTags("vitals")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class VitalsController {
  public constructor(private readonly service: VitalsService) {}

  @Post("examinations/:id/vitals")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "vitalsRecord",
    summary: "Vital bulguları kaydet",
    description:
      "Muayeneye bağlı vital bulguları (ateş, nabız, solunum, ağırlık, " +
      "BCS, kan basıncı, CRT, mukoza rengi) kaydeder. patientId + " +
      "veterinarianId muayeneden türetilir. En az bir ölçüm alanı " +
      "zorunlu (notes tek başına yetmez). Cross-tenant examination → 404.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Muayene bulunamadı." })
  @ApiResponse({
    status: 422,
    description: "Geçersiz input veya boş vital seti.",
  })
  public async record(
    @Param("id") examinationId: string,
    @Body(new ZodValidationPipe(vitalSignsCreateInputSchema))
    body: VitalSignsCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<VitalsRecord> {
    const tenantId = this.requireTenant(actor);
    return this.service.record(tenantId, examinationId, body, actor);
  }

  @Get("examinations/:id/vitals")
  @RequirePermissions("clinic:examination:read")
  @ApiOperation({
    operationId: "vitalsListByExamination",
    summary: "Muayenenin vital kayıtları",
    description:
      "Muayeneye bağlı tüm vital kayıtlarını takenAt desc sırasıyla " +
      "döndürür. Tenant-scoped; farklı tenant'ın muayenesi için boş " +
      "dizi döner.",
  })
  public async findByExamination(
    @Param("id") examinationId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<VitalsRecord[]> {
    const tenantId = this.requireTenant(actor);
    return this.service.findByExamination(tenantId, examinationId, actor);
  }

  @Get("patients/:id/vitals/latest")
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "vitalsLatestForPatient",
    summary: "Hastanın en yeni vital kaydı",
    description:
      "Hastanın tüm muayenelerindeki en yeni vital kaydını döndürür " +
      "(takenAt desc). Hiç kayıt yoksa null. Cross-tenant patient → 404.",
  })
  public async latestForPatient(
    @Param("id") patientId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<VitalsRecord | null> {
    const tenantId = this.requireTenant(actor);
    return this.service.latestForPatient(tenantId, patientId, actor);
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
