/**
 * @file Calendar controller.
 * @module apps/api/modules/calendar/calendar.controller
 * @description GOAL-030 klinik takvimi REST API.
 *
 * Endpoint'ler:
 * - `GET    /api/v1/calendar/days/:date?veterinarianId=...`
 *   — Günün tam takvimi (slot listesi). `clinic:appointment:read`
 *   izni yeterlidir. (Takvim, appointment oluşturmadan önce
 *   görüntülenir; bu yüzden read-level yeterlidir.)
 * - `PUT    /api/v1/calendar/working-hours` — Çalışma
 *   saatlerini günceller. `tenant:tenant:update` izni gerekir
 *   (tenant düzeyi ayar).
 * - `POST   /api/v1/calendar/block` — Slot aralığını blocked
 *   yapar (mola, izin). `tenant:tenant:update` izni gerekir.
 * - `DELETE /api/v1/calendar/block/:id` — Engellenmiş slot'u
 *   kaldırır. `tenant:tenant:update` izni gerekir.
 * @since GOAL-030 (FAZ-3) klinik takvimi core
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
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  blockSlotInputSchema,
  getDayParamsSchema,
  getDayQuerySchema,
  setWorkingHoursInputSchema,
  unblockSlotParamsSchema,
  type BlockSlotInput,
  type BlockedSlotResponse,
  type CalendarDay,
  type GetDayParams,
  type GetDayQuery,
  type SetWorkingHoursInput,
  type UnblockSlotParams,
} from "@vetniva/contracts";

import { CalendarService } from "./calendar.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("calendar")
@UseGuards(PermissionsGuard)
@Controller("api/v1/calendar")
export class CalendarController {
  public constructor(private readonly service: CalendarService) {}

  @Get("days/:date")
  @RequirePermissions("clinic:appointment:read")
  @ApiOperation({
    operationId: "calendarGetDay",
    summary: "Günün klinik takvimi",
    description:
      "Belirtilen tarih için veterinarian'ın working hours'undan " +
      "üretilmiş slot'ları, mevcut booked slot'ları ve blocked " +
      "slot'ları döner.",
  })
  @ApiResponse({ status: 200, description: "Takvim döndü." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  @ApiResponse({ status: 422, description: "Geçersiz tarih." })
  public async getDay(
    @Param(new ZodValidationPipe(getDayParamsSchema)) params: GetDayParams,
    @Query(new ZodValidationPipe(getDayQuerySchema)) query: GetDayQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<CalendarDay> {
    const tenantId = this.requireTenant(actor);
    return this.service.getDay(tenantId, params.date, query, actor);
  }

  @Put("working-hours")
  @RequirePermissions("tenant:tenant:update")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "calendarSetWorkingHours",
    summary: "Çalışma saatlerini güncelle",
    description:
      "Tenant (veya belirtilen veterinarian) için haftalık çalışma " +
      "saatlerini günceller. Audit `audit:calendar.hours.update` " +
      "yayınlanır.",
  })
  @ApiResponse({ status: 200, description: "Çalışma saatleri güncellendi." })
  @ApiResponse({ status: 422, description: "Geçersiz çalışma saati tanımı." })
  public async setWorkingHours(
    @Body(new ZodValidationPipe(setWorkingHoursInputSchema))
    body: SetWorkingHoursInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ updated: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.setWorkingHours(tenantId, body, actor);
    return { updated: true };
  }

  @Post("block")
  @RequirePermissions("tenant:tenant:update")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "calendarBlockSlot",
    summary: "Slot bloklama (mola/izin)",
    description:
      "Belirtilen slot aralığını blocked yapar. Audit " +
      "`audit:calendar.block` yayınlanır.",
  })
  @ApiResponse({ status: 201, description: "Slot bloklandı." })
  @ApiResponse({ status: 422, description: "Geçersiz aralık." })
  public async block(
    @Body(new ZodValidationPipe(blockSlotInputSchema))
    body: BlockSlotInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<BlockedSlotResponse> {
    const tenantId = this.requireTenant(actor);
    const rec = await this.service.blockSlot(tenantId, body, actor);
    return {
      id: rec.id,
      veterinarianId: rec.veterinarianId,
      start: rec.start,
      end: rec.end,
      reason: rec.reason,
      createdAt: rec.createdAt,
    };
  }

  @Delete("block/:id")
  @RequirePermissions("tenant:tenant:update")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "calendarUnblockSlot",
    summary: "Slot bloklamasını kaldır",
    description:
      "Engellenmiş slot'u kaldırır. Cross-tenant ID → 404. Audit " +
      "`audit:calendar.unblock` yayınlanır.",
  })
  @ApiResponse({ status: 200, description: "Slot bloklaması kaldırıldı." })
  @ApiResponse({ status: 404, description: "Engellenen slot bulunamadı." })
  public async unblock(
    @Param(new ZodValidationPipe(unblockSlotParamsSchema))
    params: UnblockSlotParams,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ unblocked: true }> {
    const tenantId = this.requireTenant(actor);
    await this.service.unblockSlot(tenantId, params.id, actor);
    return { unblocked: true };
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
