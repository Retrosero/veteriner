/**
 * @file Follow-ups (kontrol randevuları) controller.
 * @module apps/api/modules/followups/followups.controller
 *
 * @description GOAL-046 kontrol randevusu REST API. Tenant ID
 * URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 * koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/examinations/:id/followup` — Muayeneden kontrol
 * - `POST /api/v1/clinic/prescriptions/:id/followup` — Reçeteden kontrol
 * - `GET  /api/v1/clinic/patients/:id/followups`   — Hastanın bekleyen
 *                                                     kontrol randevuları
 *
 * @since GOAL-046 (FAZ-4) kontrol randevusu core
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

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type {
  Appointment,
  FollowUpFromExaminationInput,
  FollowUpFromPrescriptionInput,
} from "@vetniva/contracts";
import {
  followUpFromExaminationInputSchema,
  followUpFromPrescriptionInputSchema,
} from "@vetniva/contracts";

import { FollowupsService } from "./followups.service.js";

@ApiTags("followups")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class FollowupsController {
  public constructor(private readonly service: FollowupsService) {}

  @Post("examinations/:id/followup")
  @RequirePermissions("clinic:appointment:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "followupScheduleFromExamination",
    summary: "Muayeneden kontrol randevusu oluştur",
    description:
      "Examination aynı tenant'ta mı kontrolünden sonra " +
      "type='follow_up' appointment oluşturur. Patient muayeneden, " +
      "veterinarian override veya muayeneden türetilir. " +
      "Geçmiş tarih → 422 VET-VALIDATION-0009.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Examination bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz tarih." })
  public async scheduleFromExamination(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(followUpFromExaminationInputSchema))
    body: FollowUpFromExaminationInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Appointment> {
    const tenantId = this.requireTenant(actor);
    return this.service.scheduleFromExamination(
      tenantId,
      id,
      body.followUpDate,
      body.veterinarianId,
      body.notes,
      actor,
    );
  }

  @Post("prescriptions/:id/followup")
  @RequirePermissions("clinic:appointment:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "followupScheduleFromPrescription",
    summary: "Reçeteden kontrol randevusu oluştur",
    description:
      "Prescription aynı tenant'ta mı kontrolünden sonra " +
      "type='follow_up' appointment oluşturur. Patient + " +
      "veterinarian reçeteden türetilir. Geçmiş tarih → 422.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Prescription bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz tarih." })
  public async scheduleFromPrescription(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(followUpFromPrescriptionInputSchema))
    body: FollowUpFromPrescriptionInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Appointment> {
    const tenantId = this.requireTenant(actor);
    return this.service.scheduleFromPrescription(
      tenantId,
      id,
      body.followUpDate,
      body.notes,
      actor,
    );
  }

  @Get("patients/:id/followups")
  @RequirePermissions("clinic:appointment:read")
  @ApiOperation({
    operationId: "followupListPending",
    summary: "Hastanın bekleyen kontrol randevuları",
    description:
      "status='scheduled', type='follow_up' ve start > now olan " +
      "kontrol randevularını hasta bazlı döner.",
  })
  public async listPending(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Appointment[]> {
    const tenantId = this.requireTenant(actor);
    return this.service.listPending(tenantId, id, actor);
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
