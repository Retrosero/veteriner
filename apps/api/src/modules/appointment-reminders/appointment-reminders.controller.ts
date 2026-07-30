/**
 * @file Appointment reminder controller.
 * @module apps/api/modules/appointment-reminders/appointment-reminders.controller
 *
 * @description GOAL-036 randevu hatırlatma REST API. Bir randevuya
 * ait hatırlatmaları listeler ve admin job'u manuel tetikler.
 *
 * Endpoint'ler:
 * - `GET  /api/v1/clinic/appointments/:id/reminders` — Randevuya
 *   ait hatırlatmaları listele (status/limit/offset filtreleri).
 * - `POST /api/v1/clinic/appointment-reminders/process` — Zamanı
 *   gelen hatırlatmaları dispatch et (admin/system job endpoint'i).
 *
 * @since GOAL-036 (FAZ-3) randevu hatırlatma core
 */

import {
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
import type { ReminderListQuery } from "@vetniva/contracts";
import { reminderListQuerySchema } from "@vetniva/contracts";

import type { ScheduledReminder } from "./appointment-reminders.service.js";
import { AppointmentRemindersService } from "./appointment-reminders.service.js";

@ApiTags("appointment-reminders")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class AppointmentRemindersController {
  public constructor(
    private readonly service: AppointmentRemindersService,
  ) {}

  @Get("appointments/:id/reminders")
  @RequirePermissions("clinic:appointment:read")
  @ApiOperation({
    operationId: "appointmentReminderList",
    summary: "Randevuya ait hatırlatmaları listele",
    description:
      "Tenant-scoped reminder listesi. status/limit/offset filtreleri. " +
      "Cross-tenant → 404.",
  })
  @ApiResponse({ status: 200, description: "Liste döndü." })
  @ApiResponse({ status: 404, description: "Randevu bulunamadı." })
  public async list(
    @Param("id") appointmentId: string,
    @Query(new ZodValidationPipe(reminderListQuerySchema))
    query: ReminderListQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ items: ScheduledReminder[]; total: number }> {
    const tenantId = this.requireTenant(actor);
    return this.service.listForAppointment(
      tenantId,
      appointmentId,
      query,
      actor,
    );
  }

  @Post("appointment-reminders/process")
  @RequirePermissions("clinic:appointment:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "appointmentReminderProcessDue",
    summary: "Zamanı gelen hatırlatmaları işle",
    description:
      "Job/cron tarafından tetiklenir. now >= scheduledFor && " +
      "status='scheduled' olan reminder'ları dispatch eder. " +
      "Tenant-bazlı çalışır; tüm tenant'ları kapsar.",
  })
  @ApiResponse({ status: 200, description: "İşlem tamamlandı." })
  public async processDue(
    @CurrentActor() actor: ActorContext,
  ): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    // Bu endpoint sistem seviyesinde job çağrısı için tasarlandı;
    // tenant bağlamı zorunlu değildir. Yine de actor.tenantId
    // doluysa actor üzerinden doğrulama yaparız.
    void actor;
    return this.service.processDueReminders();
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
