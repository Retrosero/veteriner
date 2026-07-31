/**
 * @file Vaccine reminder (aşı hatırlatma) controller.
 * @module apps/api/modules/vaccines/vaccine-reminders.controller
 *
 * @description GOAL-053 aşı hatırlatma REST API. Bir hastaya ait
 * hatırlatmaları listeler, tenant config'ini getirir/günceller
 * ve admin job'u manuel tetikler.
 *
 * Endpoint'ler (personel):
 * - `GET  /api/v1/clinic/vaccines/reminders/patient/:patientId`
 *   — Hastaya ait hatırlatmaları listele (status/limit/offset
 *   + protokol/uygulama filtreleri).
 * - `GET  /api/v1/clinic/vaccines/reminders/config`
 *   — Tenant hatırlatma config'i.
 * - `PUT  /api/v1/clinic/vaccines/reminders/config`
 *   — Tenant hatırlatma config'ini güncelle.
 * - `POST /api/v1/clinic/vaccines/reminders/process`
 *   — Zamanı gelen hatırlatmaları dispatch et (admin/system
 *   job endpoint'i).
 *
 * @since GOAL-053 (FAZ-5) aşı hatırlatma core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  VaccineReminderChannel,
  VaccineReminderListQuery,
} from "@vetniva/contracts";
import {
  vaccineReminderChannelSchema,
  vaccineReminderListQuerySchema,
} from "@vetniva/contracts";
import { z } from "zod";

import type {
  VaccineReminder,
  VaccineReminderConfig,
} from "../../common/vaccines/vaccine-reminder.types.js";
import { VaccineRemindersService } from "./vaccine-reminders.service.js";

/** Tenant config update body şeması. */
const configInputSchema = z.object({
  daysBeforeDue: z.number().int().min(1).max(90),
  channels: z.array(vaccineReminderChannelSchema).min(1).max(3),
});
export type VaccineReminderConfigInput = z.infer<typeof configInputSchema>;

@ApiTags("vaccine-reminders")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class VaccineRemindersController {
  public constructor(
    private readonly service: VaccineRemindersService,
  ) {}

  // -------------------------------------------------------------------------
  // list (hastaya göre)
  // -------------------------------------------------------------------------

  @Get("vaccines/reminders/patient/:patientId")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineReminderList",
    summary: "Hastanın aşı hatırlatmalarını listele",
    description:
      "Tenant-scoped reminder listesi. status/limit/offset + " +
      "protokol/uygulama filtreleri. Cross-tenant → 404.",
  })
  @ApiResponse({ status: 200, description: "Liste döndü." })
  public async list(
    @Param("patientId") patientId: string,
    @Query(new ZodValidationPipe(vaccineReminderListQuerySchema))
    query: VaccineReminderListQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ items: VaccineReminder[]; total: number }> {
    const tenantId = this.requireTenant(actor);
    return this.service.listForPatient(tenantId, patientId, query, actor);
  }

  // -------------------------------------------------------------------------
  // Tenant config
  // -------------------------------------------------------------------------

  @Get("vaccines/reminders/config")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineReminderConfigGet",
    summary: "Tenant aşı hatırlatma config'i",
    description:
      "Tenant için `daysBeforeDue` ve `channels` döner. " +
      "Kayıt yoksa default (7 gün + sms + in_app) döner.",
  })
  public async getConfig(
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineReminderConfig> {
    const tenantId = this.requireTenant(actor);
    return this.service.getTenantConfig(tenantId, actor);
  }

  @Put("vaccines/reminders/config")
  @RequirePermissions("tenant:tenant:update")
  @ApiOperation({
    operationId: "vaccineReminderConfigUpdate",
    summary: "Tenant aşı hatırlatma config'ini güncelle",
    description:
      "Tenant için `daysBeforeDue` (1-90) ve `channels` (1-3) " +
      "yazar. Audit `audit:vaccine.reminder.config.update` (info).",
  })
  public async updateConfig(
    @Body(new ZodValidationPipe(configInputSchema))
    body: VaccineReminderConfigInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineReminderConfig> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateTenantConfig(
      tenantId,
      {
        daysBeforeDue: body.daysBeforeDue,
        channels: body.channels as VaccineReminderChannel[],
      },
      actor,
    );
  }

  // -------------------------------------------------------------------------
  // processDue — job / cron çağrısı
  // -------------------------------------------------------------------------

  @Post("vaccines/reminders/process")
  @RequirePermissions("clinic:vaccination:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "vaccineReminderProcessDue",
    summary: "Zamanı gelen aşı hatırlatmalarını işle",
    description:
      "Job/cron tarafından tetiklenir. now >= scheduledFor && " +
      "status='scheduled' olan reminder'ları dispatch eder. " +
      "Tenant-bazlı çalışır; tüm tenant'ları kapsar.",
  })
  @ApiResponse({ status: 200, description: "İşlem tamamlandı." })
  public async processDue(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    return this.service.processDueReminders();
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
