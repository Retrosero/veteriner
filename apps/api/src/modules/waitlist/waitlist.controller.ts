/**
 * @file Waitlist (bekleme listesi) controller.
 * @module apps/api/modules/waitlist/waitlist.controller
 *
 * @description GOAL-032 bekleme listesi REST API. Tenant ID URL'de
 * taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/clinic/waitlist`                    — Bekleme listesine ekle
 * - `GET  /api/v1/clinic/waitlist`                    — Liste + filtre
 * - `POST /api/v1/clinic/waitlist/:id/notify`         — Hasta bilgilendirildi
 * - `POST /api/v1/clinic/waitlist/:id/schedule`       — Randevuya dönüştür
 * - `POST /api/v1/clinic/waitlist/:id/cancel`         — İptal
 *
 * @since GOAL-032 (FAZ-3) bekleme listesi core
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
  WaitlistEntry,
  WaitlistEntryCreate,
  WaitlistFilters,
  WaitlistListResponse,
} from "@vetniva/contracts";
import {
  waitlistEntryCreateSchema,
  waitlistFiltersSchema,
} from "@vetniva/contracts";
import { z } from "zod";

import { WaitlistService } from "./waitlist.service.js";

/** Schedule body şeması (controller-local). */
const waitlistScheduleBodySchema = z.object({
  appointmentId: z.string().min(1),
});
export type WaitlistScheduleBody = z.infer<typeof waitlistScheduleBodySchema>;

/** Cancel body şeması (controller-local). */
const waitlistCancelBodySchema = z.object({
  reason: z.string().min(1).max(500),
});
export type WaitlistCancelBody = z.infer<typeof waitlistCancelBodySchema>;

@ApiTags("waitlist")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/waitlist")
export class WaitlistController {
  public constructor(private readonly service: WaitlistService) {}

  @Post()
  @RequirePermissions("clinic:appointment:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "waitlistAdd",
    summary: "Bekleme listesine ekle",
    description:
      "Hasta için uygun bir randevu slot'u bulunamadığında çağrılır. " +
      "Patient aynı tenant'ta olmalı; expiresAt verilmezse 30 gün " +
      "sonrasına ayarlanır.",
  })
  @ApiResponse({ status: 201, description: "Eklendi." })
  @ApiResponse({ status: 404, description: "Patient bulunamadı." })
  public async add(
    @Body(new ZodValidationPipe(waitlistEntryCreateSchema))
    body: WaitlistEntryCreate,
    @CurrentActor() actor: ActorContext,
  ): Promise<WaitlistEntry> {
    const tenantId = this.requireTenant(actor);
    return this.service.add(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:appointment:read")
  @ApiOperation({
    operationId: "waitlistList",
    summary: "Bekleme listesi",
    description:
      "status/priority/patientId/from/to filtreleri. Sıralama: " +
      "emergency > urgent > normal, sonra createdAt asc.",
  })
  public async list(
    @Query(new ZodValidationPipe(waitlistFiltersSchema))
    query: WaitlistFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<WaitlistListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  @Post(":id/notify")
  @RequirePermissions("clinic:appointment:update")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "waitlistNotify",
    summary: "Bekleme listesi kaydını bildirildi olarak işaretle",
    description: "status=notified, notifiedAt=now.",
  })
  public async notify(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ notified: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.notify(tenantId, id, actor);
    return { notified: true };
  }

  @Post(":id/schedule")
  @RequirePermissions("clinic:appointment:create")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "waitlistSchedule",
    summary: "Bekleme listesinden randevuya dönüştür",
    description: "status=scheduled, scheduledAppointmentId set.",
  })
  public async schedule(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(waitlistScheduleBodySchema))
    body: WaitlistScheduleBody,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ scheduled: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.convertToAppointment(
      tenantId,
      id,
      body.appointmentId,
      actor,
    );
    return { scheduled: true };
  }

  @Post(":id/cancel")
  @RequirePermissions("clinic:appointment:cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "waitlistCancel",
    summary: "Bekleme listesi kaydını iptal et",
    description: "status=cancelled. Sebep zorunlu.",
  })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(waitlistCancelBodySchema))
    body: WaitlistCancelBody,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ cancelled: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.cancel(tenantId, id, body.reason, actor);
    return { cancelled: true };
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
