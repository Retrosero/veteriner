/**
 * @file Patient controller.
 * @module apps/api/modules/patients/patients.controller
 *
 * @description Patient (hayvan) REST API. Tenant ID URL'de taşınmaz;
 *   actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/patients`         — Yeni hasta
 * - `GET    /api/v1/clinic/patients/:id`     — Detay
 * - `GET    /api/v1/clinic/patients`         — Arama + pagination
 * - `DELETE /api/v1/clinic/patients/:id`     — Arşivle (soft delete)
 * - `POST   /api/v1/clinic/patients/:id/transfer` — Sahiplik devri
 *   (kimlik seviyesi; `clinic:patient:transfer` izni gerekir)
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 * @updated GOAL-022 (FAZ-2) sahiplik devri core
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  patientCreateInputSchema,
  patientOwnershipTransferInputSchema,
  patientSearchQuerySchema,
  type PatientCreateInput,
  type PatientOwnershipTransferInput,
  type PatientSearchQuery,
} from "@vetniva/contracts";

import { PatientsService, type TransferResult } from "./patients.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { Patient } from "../../common/patients/patient.types.js";

@ApiTags("patients")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/patients")
export class PatientsController {
  public constructor(private readonly service: PatientsService) {}

  @Post()
  @RequirePermissions("clinic:patient:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "patientCreate",
    summary: "Yeni hasta (hayvan)",
    description:
      "Owner'ın aynı tenant'ta olduğu doğrulanır. TR pilot: dog, cat, bird.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Owner bulunamadı." })
  @ApiResponse({ status: 409, description: "Duplicate mikroçip." })
  @ApiResponse({ status: 422, description: "Validation hatası." })
  public async create(
    @Body(new ZodValidationPipe(patientCreateInputSchema))
    body: PatientCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Patient> {
    const tenantId = this.requireTenant(actor);
    return this.service.create(tenantId, body, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "patientGetById",
    summary: "Hasta detayı",
    description: "ID'ye göre hasta getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Patient> {
    const tenantId = this.requireTenant(actor);
    const patient = await this.service.findById(tenantId, id, actor);
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return patient;
  }

  @Get()
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "patientSearch",
    summary: "Hasta arama",
    description:
      "Tenant-scoped arama. ownerId / species / search filtre olarak kullanılır.",
  })
  public async search(
    @Query(new ZodValidationPipe(patientSearchQuerySchema))
    query: PatientSearchQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ items: Patient[]; total: number }> {
    const tenantId = this.requireTenant(actor);
    return this.service.search(tenantId, query, actor);
  }

  @Delete(":id")
  @RequirePermissions("clinic:patient:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "patientArchive",
    summary: "Hasta arşivleme",
    description: "Soft delete: archivedAt set edilir, identity gizlenir.",
  })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Patient> {
    const tenantId = this.requireTenant(actor);
    return this.service.archive(tenantId, id, actor);
  }

  @Post(":id/transfer")
  @RequirePermissions("clinic:patient:transfer")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "patientTransferOwnership",
    summary: "Hasta sahiplik devri",
    description:
      "Patient.ownerId yeni sahibe güncellenir (kimlik seviyesi). " +
      "Cross-tenant patient/new owner → 404; arşivli hasta → 422; " +
      "aynı kişiye transfer → 422. Audit `audit:patient.transfer` " +
      "yayınlanır (warning); PII alanları mask'lenir.",
  })
  @ApiResponse({ status: 200, description: "Devir tamamlandı." })
  @ApiResponse({
    status: 404,
    description: "Hasta veya yeni sahip bulunamadı.",
  })
  @ApiResponse({ status: 422, description: "Arşivli hasta veya aynı sahip." })
  public async transfer(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(patientOwnershipTransferInputSchema))
    body: PatientOwnershipTransferInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<TransferResult> {
    const tenantId = this.requireTenant(actor);
    return this.service.transferOwnership(
      tenantId,
      id,
      body.newOwnerId,
      body.reason,
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
