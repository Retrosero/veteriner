/**
 * @file Diagnosis (teşhis) controller.
 * @module apps/api/modules/diagnoses/diagnoses.controller
 *
 * @description GOAL-043 teşhis REST API. Tenant ID URL'de taşınmaz;
 * actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/examinations/:id/diagnoses`  — Yeni teşhis
 * - `GET    /api/v1/clinic/examinations/:id/diagnoses`  — Muayene teşhisleri
 * - `GET    /api/v1/clinic/patients/:id/diagnoses`      — Hasta teşhisleri (status filtresi)
 * - `POST   /api/v1/clinic/diagnoses/:id/resolve`       — Çözüldü
 * - `POST   /api/v1/clinic/diagnoses/:id/chronic`       — Kronik yap
 * - `POST   /api/v1/clinic/diagnoses/:id/ruled-out`     — Ele (ruled out)
 * - `DELETE /api/v1/clinic/diagnoses/:id`               — Soft delete (archive)
 *
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import {
  Body,
  Controller,
  Delete,
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
  Diagnosis,
  DiagnosisCreateInput,
  DiagnosisPatientListFilters,
} from "@vetniva/contracts";
import {
  diagnosisCreateInputSchema,
  diagnosisPatientListFiltersSchema,
} from "@vetniva/contracts";

import { DiagnosesService } from "./diagnoses.service.js";

@ApiTags("diagnoses")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class DiagnosesController {
  public constructor(private readonly service: DiagnosesService) {}

  // -------------------------------------------------------------------------
  // Examination-scoped
  // -------------------------------------------------------------------------

  @Post("examinations/:id/diagnoses")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "diagnosisAdd",
    summary: "Yeni teşhis ekle",
    description:
      "Examination aynı tenant'ta mı kontrolünden sonra teşhis " +
      "ekler. status='active' olarak işaretlenir; patientId " +
      "examination'dan türetilir.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Examination bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz input." })
  public async add(
    @Param("id") examinationId: string,
    @Body(new ZodValidationPipe(diagnosisCreateInputSchema))
    body: Omit<DiagnosisCreateInput, "examinationId">,
    @CurrentActor() actor: ActorContext,
  ): Promise<Diagnosis> {
    const tenantId = this.requireTenant(actor);
    return this.service.add(
      tenantId,
      { ...body, examinationId },
      actor,
    );
  }

  @Get("examinations/:id/diagnoses")
  @RequirePermissions("clinic:examination:read")
  @ApiOperation({
    operationId: "diagnosisListForExamination",
    summary: "Muayeneye bağlı teşhisleri getir",
    description:
      "Examination-scoped, arşivlenmemiş teşhisleri oluşturma " +
      "zamanına göre sıralı getirir.",
  })
  public async listForExamination(
    @Param("id") examinationId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Diagnosis[]> {
    const tenantId = this.requireTenant(actor);
    return this.service.listForExamination(tenantId, examinationId, actor);
  }

  // -------------------------------------------------------------------------
  // Patient-scoped
  // -------------------------------------------------------------------------

  @Get("patients/:id/diagnoses")
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "diagnosisListForPatient",
    summary: "Hastanın tüm teşhislerini getir",
    description:
      "Hastanın tüm muayenelerinden teşhisleri toplar. " +
      "Opsiyonel status filtresi (?status=active).",
  })
  public async listForPatient(
    @Param("id") patientId: string,
    @Query(new ZodValidationPipe(diagnosisPatientListFiltersSchema))
    query: DiagnosisPatientListFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<Diagnosis[]> {
    const tenantId = this.requireTenant(actor);
    return this.service.listForPatient(tenantId, patientId, actor, query);
  }

  // -------------------------------------------------------------------------
  // Diagnosis-scoped
  // -------------------------------------------------------------------------

  @Post("diagnoses/:id/resolve")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "diagnosisResolve",
    summary: "Teşhisi çözümlenmiş (resolved) olarak işaretle",
    description:
      "status='active' olan teşhisi 'resolved' yapar; resolvedAt set " +
      "edilir. Aksi durumda → 409 VET-DIAG-0001.",
  })
  public async resolve(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Diagnosis> {
    const tenantId = this.requireTenant(actor);
    return this.service.resolve(tenantId, id, actor);
  }

  @Post("diagnoses/:id/chronic")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "diagnosisSetChronic",
    summary: "Teşhisi kronik (chronic) yap",
    description:
      "status='active' olan teşhisi 'chronic' yapar. " +
      "Aksi durumda → 409 VET-DIAG-0001.",
  })
  public async setChronic(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Diagnosis> {
    const tenantId = this.requireTenant(actor);
    return this.service.setChronic(tenantId, id, actor);
  }

  @Post("diagnoses/:id/ruled-out")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "diagnosisRuledOut",
    summary: "Teşhisi elenmiş (ruled out) olarak işaretle",
    description:
      "status='active' | 'differential' olan teşhisi 'ruled_out' " +
      "yapar. Ayırıcı tanıdan elemeye izin verilir (FAZ-4 kuralı). " +
      "Aksi durumda → 409 VET-DIAG-0001.",
  })
  public async setRuledOut(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Diagnosis> {
    const tenantId = this.requireTenant(actor);
    return this.service.setRuledOut(tenantId, id, actor);
  }

  @Delete("diagnoses/:id")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "diagnosisArchive",
    summary: "Teşhisi arşivle (soft delete)",
    description:
      "archivedAt set eder; klinik kayıt append-only olduğu için " +
      "fiziksel silme yapılmaz. Idempotent: zaten arşivlenmişse " +
      "no-op.",
  })
  public async remove(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ archived: true; id: string }> {
    const tenantId = this.requireTenant(actor);
    await this.service.remove(tenantId, id, actor);
    return { archived: true, id };
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
