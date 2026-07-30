/**
 * @file Examination (muayene) controller.
 * @module apps/api/modules/examinations/examinations.controller
 *
 * @description GOAL-040 muayene REST API. Tenant ID URL'de taşınmaz;
 * actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/examinations`              — Yeni muayene başlat
 * - `GET  /api/v1/clinic/examinations/:id`          — Detay
 * - `GET  /api/v1/clinic/examinations`              — Liste + filtre
 * - `POST /api/v1/clinic/examinations/:id/complete` — Tamamla
 * - `POST /api/v1/clinic/examinations/:id/sign`     — İmzala
 * - `POST /api/v1/clinic/examinations/:id/amend`    — Düzelt (append-only)
 *
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
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
  Examination,
  ExaminationAmend,
  ExaminationAmendInput,
  ExaminationCreateInput,
  ExaminationFilters,
  ExaminationListResponse,
} from "@vetniva/contracts";
import {
  examinationAmendInputSchema,
  examinationCreateInputSchema,
  examinationFiltersSchema,
} from "@vetniva/contracts";

import { ExaminationsService } from "./examinations.service.js";

@ApiTags("examinations")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/examinations")
export class ExaminationsController {
  public constructor(private readonly service: ExaminationsService) {}

  @Post()
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "examinationStart",
    summary: "Yeni muayene başlat",
    description:
      "Appointment aynı tenant'ta mı kontrolünden sonra muayene " +
      "başlatır. status='in_progress' olarak işaretlenir; " +
      "patientId + veterinarianId appointment'tan türetilir.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Appointment veya patient bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz input." })
  public async start(
    @Body(new ZodValidationPipe(examinationCreateInputSchema))
    body: ExaminationCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Examination> {
    const tenantId = this.requireTenant(actor);
    return this.service.start(tenantId, body, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:examination:read")
  @ApiOperation({
    operationId: "examinationGetById",
    summary: "Muayene detayı",
    description: "ID'ye göre muayene getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Examination> {
    const tenantId = this.requireTenant(actor);
    const exam = await this.service.findById(tenantId, id, actor);
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return exam;
  }

  @Get()
  @RequirePermissions("clinic:examination:read")
  @ApiOperation({
    operationId: "examinationList",
    summary: "Muayene listesi",
    description:
      "patientId / veterinarianId / status / from / to / limit / offset " +
      "filtreleri ile tenant-scoped arama.",
  })
  public async list(
    @Query(new ZodValidationPipe(examinationFiltersSchema))
    query: ExaminationFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ExaminationListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  @Post(":id/complete")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "examinationComplete",
    summary: "Muayene tamamla",
    description:
      "status='in_progress' olan muayeneyi 'completed' yapar ve " +
      "completedAt set eder. Aksi durumda → 409 VET-EXAM-0001.",
  })
  public async complete(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Examination> {
    const tenantId = this.requireTenant(actor);
    return this.service.complete(tenantId, id, actor);
  }

  @Post(":id/sign")
  @RequirePermissions("clinic:examination:sign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "examinationSign",
    summary: "Muayene imzala",
    description:
      "status='completed' olan muayeneyi imzalar (signedAt + signedBy). " +
      "İmza sonrası UPDATE/DELETE trigger aktifleşir (FAZ-0'da no-op " +
      "flag). Aksi durumda → 409 VET-EXAM-0002.",
  })
  public async sign(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Examination> {
    const tenantId = this.requireTenant(actor);
    return this.service.sign(tenantId, id, actor);
  }

  @Post(":id/amend")
  @RequirePermissions("clinic:examination:amend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "examinationAmend",
    summary: "Muayene düzelt (amend)",
    description:
      "İmza sonrası düzeltme için yeni ExaminationAmend kaydı oluşturur " +
      "(append-only). status='amended' yapılır; önceki imza zamanı/" +
      "imzacısı amendment kaydında saklanır.",
  })
  public async amend(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(examinationAmendInputSchema))
    body: ExaminationAmendInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ examination: Examination; amend: ExaminationAmend }> {
    const tenantId = this.requireTenant(actor);
    const examination = await this.service.amend(tenantId, id, body, actor);
    const amends = await this.service.listAmends(tenantId, id, actor);
    const last = amends[amends.length - 1];
    if (!last) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Amend kaydı oluşturulamadı",
        httpStatus: 500,
        severity: "error",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return { examination, amend: last };
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
