/**
 * @file Alerts controller.
 * @module apps/api/modules/alerts/alerts.controller
 * @description GOAL-023 alerji/kronik uyarılar REST API.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/patients/:patientId/alerts` — Yeni uyarı
 *   (`clinic:examination:create` izni; reçetede uyarı için)
 * - `GET    /api/v1/clinic/patients/:patientId/alerts?severity=critical&activeOnly=true`
 *   — Hasta uyarıları (`clinic:patient:read`)
 * - `DELETE /api/v1/clinic/alerts/:id` — Arşivle (`clinic:examination:create`).
 * @since GOAL-023 (FAZ-2) alerji/kronik uyarılar core
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
  alertCreateInputSchema,
  alertListQuerySchema,
  type Alert,
  type AlertCreateInput,
  type AlertListQuery,
} from "@vetniva/contracts";

import { AlertsService } from "./alerts.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("alerts")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class AlertsController {
  public constructor(private readonly service: AlertsService) {}

  @Post("patients/:patientId/alerts")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "alertCreate",
    summary: "Yeni klinik uyarı",
    description:
      "Alerji, kronik durum, ilaç etkileşimi veya davranış uyarısı " +
      "oluşturur. Severity `critical` ise audit yayınlanır.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 404, description: "Hasta bulunamadı." })
  public async create(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Body(new ZodValidationPipe(alertCreateInputSchema))
    body: AlertCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Alert> {
    const tenantId = this.requireTenant(actor);
    return this.service.add(tenantId, patientId, body, actor);
  }

  @Get("patients/:patientId/alerts")
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "alertListForPatient",
    summary: "Hasta uyarıları",
    description:
      "Tenant-scoped liste. severity ve activeOnly filtre olarak kullanılır.",
  })
  public async list(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query(new ZodValidationPipe(alertListQuerySchema))
    query: AlertListQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ items: Alert[]; total: number }> {
    const tenantId = this.requireTenant(actor);
    const items = this.service.listForPatient(tenantId, patientId, actor, {
      severity: query.severity,
      activeOnly: query.activeOnly === "true",
    });
    return { items, total: items.length };
  }

  @Delete("alerts/:id")
  @RequirePermissions("clinic:examination:create")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "alertArchive",
    summary: "Uyarıyı arşivle",
    description: "Soft delete: archivedAt set edilir. İdempotent.",
  })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    await this.service.archive(tenantId, id, actor);
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
