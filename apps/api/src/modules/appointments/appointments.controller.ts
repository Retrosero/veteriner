/**
 * @file Appointment (randevu) controller.
 * @module apps/api/modules/appointments/appointments.controller
 * @description GOAL-031 randevu REST API. Tenant ID URL'de taşınmaz;
 * actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/appointments`              — Yeni randevu
 * - `GET    /api/v1/clinic/appointments/:id`          — Detay
 * - `GET    /api/v1/clinic/appointments`              — Liste + filtre
 * - `PATCH  /api/v1/clinic/appointments/:id`          — Güncelle
 * - `POST   /api/v1/clinic/appointments/:id/cancel`   — İptal
 * - `POST   /api/v1/clinic/appointments/:id/complete` — Tamamla
 * - `POST   /api/v1/clinic/appointments/:id/no-show`  — No-show.
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
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
import {
  appointmentCancelInputSchema,
  appointmentCreateInputSchema,
  appointmentFiltersSchema,
  appointmentUpdateInputSchema,
} from "@vetniva/contracts";

import { AppointmentsService } from "./appointments.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Appointment,
  AppointmentCancelInput,
  AppointmentCreateInput,
  AppointmentFilters,
  AppointmentListResponse,
  AppointmentUpdateInput,
} from "@vetniva/contracts";

@ApiTags("appointments")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/appointments")
export class AppointmentsController {
  public constructor(private readonly service: AppointmentsService) {}

  @Post()
  @RequirePermissions("clinic:appointment:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "appointmentCreate",
    summary: "Yeni randevu",
    description:
      "Patient + veterinarian aynı tenant'ta mı, start gelecekte mi, " +
      "slot uygun mu kontrollerinden sonra randevu oluşturur. " +
      "Calendar'a booked slot eklenir.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Patient bulunamadı." })
  @ApiResponse({ status: 409, description: "Slot çakışması." })
  @ApiResponse({ status: 422, description: "Geçersiz input." })
  public async create(
    @Body(new ZodValidationPipe(appointmentCreateInputSchema))
    body: AppointmentCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Appointment> {
    const tenantId = this.requireTenant(actor);
    return this.service.create(tenantId, body, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:appointment:read")
  @ApiOperation({
    operationId: "appointmentGetById",
    summary: "Randevu detayı",
    description: "ID'ye göre randevu getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Appointment> {
    const tenantId = this.requireTenant(actor);
    const appt = await this.service.findById(tenantId, id, actor);
    if (!appt) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return appt;
  }

  @Get()
  @RequirePermissions("clinic:appointment:read")
  @ApiOperation({
    operationId: "appointmentList",
    summary: "Randevu listesi",
    description:
      "patientId / veterinarianId / status / from / to / limit / offset " +
      "filtreleri ile tenant-scoped arama.",
  })
  public async list(
    @Query(new ZodValidationPipe(appointmentFiltersSchema))
    query: AppointmentFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<AppointmentListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  @Patch(":id")
  @RequirePermissions("clinic:appointment:update")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "appointmentUpdate",
    summary: "Randevu güncelle",
    description:
      "start / duration / veterinarian değişikliğinde çakışma " +
      "kontrolü tekrar yapılır.",
  })
  public async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(appointmentUpdateInputSchema))
    body: AppointmentUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Appointment> {
    const tenantId = this.requireTenant(actor);
    return this.service.update(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("clinic:appointment:cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "appointmentCancel",
    summary: "Randevu iptali",
    description: "Status='cancelled'. Calendar'dan booked slot kaldırılır.",
  })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(appointmentCancelInputSchema))
    body: AppointmentCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ cancelled: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.cancel(tenantId, id, body.reason, actor);
    return { cancelled: true };
  }

  @Post(":id/complete")
  @RequirePermissions("clinic:appointment:complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "appointmentComplete",
    summary: "Randevu tamamlama",
    description: "Status='completed'. Calendar'dan booked slot kaldırılır.",
  })
  public async complete(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ completed: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.complete(tenantId, id, actor);
    return { completed: true };
  }

  @Post(":id/no-show")
  @RequirePermissions("clinic:appointment:complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "appointmentNoShow",
    summary: "Randevu no-show işaretle",
    description: "Status='no_show'. Calendar'dan booked slot kaldırılır.",
  })
  public async noShow(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ marked: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.markNoShow(tenantId, id, actor);
    return { marked: true };
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
