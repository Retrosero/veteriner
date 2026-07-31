/**
 * @file OperationNote controller.
 * @module apps/api/modules/operation-notes/operation-notes.controller
 *
 * @description GOAL-083 (FAZ-8) ameliyat operasyon notu REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST  /api/v1/clinic/operation-notes`                       — Yeni not (plan in_progress)
 * - `GET   /api/v1/clinic/operation-notes`                       — Arama
 * - `GET   /api/v1/clinic/operation-notes/:id`                   — Detay + alt kayıtlar
 * - `PATCH /api/v1/clinic/operation-notes/:id`                   — Güncelle (draft)
 * - `POST  /api/v1/clinic/operation-notes/:id/team`               — Ekip üyesi ekle (draft)
 * - `POST  /api/v1/clinic/operation-notes/:id/materials`         — Malzeme ekle (draft)
 * - `POST  /api/v1/clinic/operation-notes/:id/finalize`          — Finalize (kilitler)
 * - `POST  /api/v1/clinic/operation-notes/:id/amend`             — Amendment (finalize sonrası)
 *
 * @since GOAL-083 (FAZ-8) operasyon notu ve kullanılan malzemeler core
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
  operationNoteAmendInputSchema,
  operationNoteCreateInputSchema,
  operationNoteFinalizeInputSchema,
  operationNoteFiltersSchema,
  operationNoteMaterialInputSchema,
  operationNoteTeamInputSchema,
  operationNoteUpdateInputSchema,
  type OperationNote,
  type OperationNoteAmendInput,
  type OperationNoteCreateInput,
  type OperationNoteDetail,
  type OperationNoteFilters,
  type OperationNoteFinalizeInput,
  type OperationNoteListResponse,
  type OperationNoteMaterial,
  type OperationNoteMaterialInput,
  type OperationNoteTeam,
  type OperationNoteTeamInput,
  type OperationNoteUpdateInput,
} from "@vetniva/contracts";

import { OperationNotesService } from "./operation-notes.service.js";

@ApiTags("clinic/operation-notes")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/operation-notes")
export class OperationNotesController {
  public constructor(
    private readonly service: OperationNotesService,
  ) {}

  @Post()
  @RequirePermissions("clinic:surgery:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "operationNoteCreate",
    summary: "Yeni operasyon notu",
    description:
      "Bir ameliyat planı için operasyon notu açar. Plan in_progress " +
      "olmalı (422 VET-OPNOTE-0003). Aynı plan için ikinci not " +
      "reddedilir (409 VET-OPNOTE-0004).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(operationNoteCreateInputSchema))
    body: OperationNoteCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNote> {
    const tenantId = this.requireTenant(actor);
    return this.service.createOperationNote(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:surgery:read")
  @ApiOperation({
    operationId: "operationNoteList",
    summary: "Operasyon notu arama",
    description:
      "Tenant-scoped arama. status/patientId/surgeryPlanId/sort.",
  })
  public async list(
    @Query(new ZodValidationPipe(operationNoteFiltersSchema))
    query: OperationNoteFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNoteListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listOperationNotes(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:surgery:read")
  @ApiOperation({
    operationId: "operationNoteGetById",
    summary: "Operasyon notu detayı (ekip + malzeme)",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNoteDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getOperationNoteDetail(
      tenantId,
      id,
      actor,
    );
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-OPNOTE-0001",
        message: "Operasyon notu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-OPNOTE-0001",
      });
    }
    return detail;
  }

  @Patch(":id")
  @RequirePermissions("clinic:surgery:create")
  @ApiOperation({
    operationId: "operationNoteUpdate",
    summary: "Operasyon notu güncelleme (draft)",
    description:
      "Yalnızca draft durumda. Finalize sonrası PATCH reddedilir " +
      "(409 VET-OPNOTE-0002); amendment endpoint'ini kullanın.",
  })
  public async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(operationNoteUpdateInputSchema))
    body: OperationNoteUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNote> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateOperationNote(tenantId, id, body, actor);
  }

  @Post(":id/team")
  @RequirePermissions("clinic:surgery:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "operationNoteAddTeam",
    summary: "Ekip üyesi ekle (draft)",
    description: "Yalnızca draft durumda (409 VET-OPNOTE-0002).",
  })
  public async addTeam(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(operationNoteTeamInputSchema))
    body: OperationNoteTeamInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNoteTeam> {
    const tenantId = this.requireTenant(actor);
    return this.service.addTeamMember(tenantId, id, body, actor);
  }

  @Post(":id/materials")
  @RequirePermissions("clinic:surgery:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "operationNoteAddMaterial",
    summary: "Kullanılan malzeme ekle (draft)",
    description:
      "Yalnızca draft durumda (409 VET-OPNOTE-0002). Finalize'da her " +
      "malzeme için `clinical_use` stock movement oluşturulur.",
  })
  public async addMaterial(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(operationNoteMaterialInputSchema))
    body: OperationNoteMaterialInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNoteMaterial> {
    const tenantId = this.requireTenant(actor);
    return this.service.addMaterial(tenantId, id, body, actor);
  }

  @Post(":id/finalize")
  @RequirePermissions("clinic:surgery:complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "operationNoteFinalize",
    summary: "Operasyon notunu finalize et",
    description:
      "draft → finalized. Tüm malzemeler için clinical_use stock " +
      "movement oluşturulur. Zaten finalize/amended ise 409 " +
      "VET-OPNOTE-0002.",
  })
  public async finalize(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(operationNoteFinalizeInputSchema))
    body: OperationNoteFinalizeInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNote> {
    const tenantId = this.requireTenant(actor);
    return this.service.finalizeOperationNote(tenantId, id, body, actor);
  }

  @Post(":id/amend")
  @RequirePermissions("clinic:surgery:amend")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "operationNoteAmend",
    summary: "Amendment (finalize sonrası düzeltme)",
    description:
      "Yalnızca finalized notlar amend edilebilir (409 VET-OPNOTE-0005). " +
      "Orijinal amended işaretlenir; yeni revision (draft) oluşturulur.",
  })
  public async amend(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(operationNoteAmendInputSchema))
    body: OperationNoteAmendInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<OperationNote> {
    const tenantId = this.requireTenant(actor);
    return this.service.amendOperationNote(tenantId, id, body, actor);
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
