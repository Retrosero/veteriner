/**
 * @file Hospitalization controller.
 * @module apps/api/modules/hospitalization/hospitalization.controller
 *
 * @description GOAL-084 (FAZ-8) yatış ve kafes yönetimi REST
 * API. Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler — Cage:
 * - `POST  /api/v1/clinic/cages`             — Yeni kafes
 * - `GET   /api/v1/clinic/cages`             — Arama
 * - `GET   /api/v1/clinic/cages/:id`         — Detay
 * - `PATCH /api/v1/clinic/cages/:id`         — Güncelle
 *
 * Endpoint'ler — Hospitalization:
 * - `POST  /api/v1/clinic/hospitalizations`              — Yeni yatış (planned)
 * - `GET   /api/v1/clinic/hospitalizations`              — Arama
 * - `GET   /api/v1/clinic/hospitalizations/:id`          — Detay + atamalar
 * - `PATCH /api/v1/clinic/hospitalizations/:id`          — Güncelle (planned/active)
 * - `POST  /api/v1/clinic/hospitalizations/:id/admit`     — Kabul (planned → admitted)
 * - `POST  /api/v1/clinic/hospitalizations/:id/discharge` — Taburcu (active → discharged)
 * - `POST  /api/v1/clinic/hospitalizations/:id/cancel`    — İptal
 * - `POST  /api/v1/clinic/hospitalizations/:id/cage-assignments` — Kafes ata
 * - `POST  /api/v1/clinic/hospitalizations/cage-assignments/:assignmentId/end` — Kafes ataması sonlandır
 *
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
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
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  cageAssignmentCreateInputSchema,
  cageAssignmentEndInputSchema,
  cageCreateInputSchema,
  cageFiltersSchema,
  cageUpdateInputSchema,
  hospitalizationAdmitInputSchema,
  hospitalizationCancelInputSchema,
  hospitalizationCreateInputSchema,
  hospitalizationDischargeInputSchema,
  hospitalizationFiltersSchema,
  hospitalizationUpdateInputSchema,
  type Cage,
  type CageAssignment,
  type CageAssignmentCreateInput,
  type CageAssignmentEndInput,
  type CageCreateInput,
  type CageFilters,
  type CageListResponse,
  type CageUpdateInput,
  type Hospitalization,
  type HospitalizationAdmitInput,
  type HospitalizationCancelInput,
  type HospitalizationCreateInput,
  type HospitalizationDetail,
  type HospitalizationDischargeInput,
  type HospitalizationFilters,
  type HospitalizationListResponse,
  type HospitalizationUpdateInput,
} from "@vetniva/contracts";

import { HospitalizationService } from "./hospitalization.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/hospitalization")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class HospitalizationController {
  public constructor(private readonly service: HospitalizationService) {}

  // ===========================================================================
  // CAGE
  // ===========================================================================

  @Post("cages")
  @RequirePermissions("clinic:hospitalization:admit")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cageCreate",
    summary: "Yeni kafes",
    description:
      "Tenant-scoped kafes tanımı. Aynı code mevcutsa 409 " + "VET-HOSP-0006.",
  })
  public async createCage(
    @Body(new ZodValidationPipe(cageCreateInputSchema))
    body: CageCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Cage> {
    const tenantId = this.requireTenant(actor);
    return this.service.createCage(tenantId, body, actor);
  }

  @Get("cages")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "cageList",
    summary: "Kafes arama",
    description: "kind/active filtreleri.",
  })
  public async listCages(
    @Query(new ZodValidationPipe(cageFiltersSchema))
    query: CageFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<CageListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listCages(tenantId, query, actor);
  }

  @Get("cages/:id")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "cageGetById",
    summary: "Kafes detayı",
    description: "Cross-tenant → 404.",
  })
  public async getCage(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Cage> {
    const tenantId = this.requireTenant(actor);
    const cage = await this.service.getCage(tenantId, id, actor);
    if (!cage) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Kafes bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
      });
    }
    return cage;
  }

  @Patch("cages/:id")
  @RequirePermissions("clinic:hospitalization:admit")
  @ApiOperation({
    operationId: "cageUpdate",
    summary: "Kafes güncelleme",
  })
  public async updateCage(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cageUpdateInputSchema))
    body: CageUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Cage> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateCage(tenantId, id, body, actor);
  }

  // ===========================================================================
  // HOSPITALIZATION
  // ===========================================================================

  @Post("hospitalizations")
  @RequirePermissions("clinic:hospitalization:admit")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "hospitalizationCreate",
    summary: "Yeni yatış (planned)",
    description: "Aynı hasta için aktif yatış varsa 409 VET-HOSP-0007.",
  })
  public async createHospitalization(
    @Body(new ZodValidationPipe(hospitalizationCreateInputSchema))
    body: HospitalizationCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Hospitalization> {
    const tenantId = this.requireTenant(actor);
    return this.service.createHospitalization(tenantId, body, actor);
  }

  @Get("hospitalizations")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "hospitalizationList",
    summary: "Yatış arama",
    description: "status/patientId/activeOnly/sort.",
  })
  public async listHospitalizations(
    @Query(new ZodValidationPipe(hospitalizationFiltersSchema))
    query: HospitalizationFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listHospitalizations(tenantId, query, actor);
  }

  @Get("hospitalizations/:id")
  @RequirePermissions("clinic:hospitalization:read")
  @ApiOperation({
    operationId: "hospitalizationGetById",
    summary: "Yatış detayı (kafes atamaları dahil)",
    description: "Cross-tenant → 404.",
  })
  public async getHospitalizationDetail(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<HospitalizationDetail> {
    const tenantId = this.requireTenant(actor);
    const detail = await this.service.getHospitalizationDetail(
      tenantId,
      id,
      actor,
    );
    if (!detail) {
      throw new DomainError({
        errorCode: "VET-HOSP-0001",
        message: "Yatış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-HOSP-0001",
      });
    }
    return detail;
  }

  @Patch("hospitalizations/:id")
  @RequirePermissions("clinic:hospitalization:admit")
  @ApiOperation({
    operationId: "hospitalizationUpdate",
    summary: "Yatış güncelleme (planned/admitted/active)",
    description: "discharged/cancelled yatış düzenlenemez (409 VET-HOSP-0002).",
  })
  public async updateHospitalization(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(hospitalizationUpdateInputSchema))
    body: HospitalizationUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Hospitalization> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateHospitalization(tenantId, id, body, actor);
  }

  @Post("hospitalizations/:id/admit")
  @RequirePermissions("clinic:hospitalization:admit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "hospitalizationAdmit",
    summary: "Yatış kabul (planned → admitted)",
    description: "Yalnızca planned (409 VET-HOSP-0003).",
  })
  public async admit(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(hospitalizationAdmitInputSchema))
    body: HospitalizationAdmitInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Hospitalization> {
    const tenantId = this.requireTenant(actor);
    return this.service.admitHospitalization(tenantId, id, body, actor);
  }

  @Post("hospitalizations/:id/discharge")
  @RequirePermissions("clinic:hospitalization:discharge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "hospitalizationDischarge",
    summary: "Yatış taburcu (active → discharged)",
    description:
      "Tüm açık kafes atamaları sonlanır. Yalnızca admitted/active " +
      "(409 VET-HOSP-0004).",
  })
  public async discharge(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(hospitalizationDischargeInputSchema))
    body: HospitalizationDischargeInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Hospitalization> {
    const tenantId = this.requireTenant(actor);
    return this.service.dischargeHospitalization(tenantId, id, body, actor);
  }

  @Post("hospitalizations/:id/cancel")
  @RequirePermissions("clinic:hospitalization:admit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "hospitalizationCancel",
    summary: "Yatış iptali (planned/admitted → cancelled)",
    description: "Yalnızca planned/admitted (409 VET-HOSP-0008).",
  })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(hospitalizationCancelInputSchema))
    body: HospitalizationCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Hospitalization> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelHospitalization(tenantId, id, body, actor);
  }

  @Post("hospitalizations/:id/cage-assignments")
  @RequirePermissions("clinic:hospitalization:admit")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cageAssignmentCreate",
    summary: "Yatışa kafes ata",
    description:
      "Aynı kafeste zaman çakışması varsa 409 VET-HOSP-0009. " +
      "Bu yatış için zaten açık kafes ataması varsa 409 VET-HOSP-0011. " +
      "İlk atamada yatış admitted → active geçer.",
  })
  public async assignCage(
    @Param("id") hospitalizationId: string,
    @Body(new ZodValidationPipe(cageAssignmentCreateInputSchema))
    body: CageAssignmentCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CageAssignment> {
    const tenantId = this.requireTenant(actor);
    return this.service.assignCage(tenantId, hospitalizationId, body, actor);
  }

  @Post("hospitalizations/cage-assignments/:assignmentId/end")
  @RequirePermissions("clinic:hospitalization:admit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "cageAssignmentEnd",
    summary: "Kafes atamasını sonlandır",
    description:
      "to set edilir; assignment kapanır. Zaten kapalıysa 409 " +
      "VET-HOSP-0013.",
  })
  public async endCageAssignment(
    @Param("assignmentId") assignmentId: string,
    @Body(new ZodValidationPipe(cageAssignmentEndInputSchema))
    body: CageAssignmentEndInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CageAssignment> {
    const tenantId = this.requireTenant(actor);
    return this.service.endCageAssignment(tenantId, assignmentId, body, actor);
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
