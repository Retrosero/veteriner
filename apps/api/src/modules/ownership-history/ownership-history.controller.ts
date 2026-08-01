/**
 * @file Ownership history controller.
 * @module apps/api/modules/ownership-history/ownership-history.controller
 *
 * @description Sahiplik geçmişi REST API. Tenant ID URL'de taşınmaz;
 *   actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `GET  /api/v1/clinic/patients/:patientId/ownership`     — Geçmiş
 * - `GET  /api/v1/clinic/patients/:patientId/ownership/active` — Aktif kayıt
 * - `POST /api/v1/clinic/patients/:patientId/ownership`     — Devir (transfer)
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

import {
  Body,
  Controller,
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
  ownershipTransferInputSchema,
  type OwnershipTransferInput,
} from "@vetniva/contracts";

import { OwnershipHistoryService } from "./ownership-history.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { Ownership } from "../../common/ownership/ownership.types.js";

@ApiTags("ownership")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/patients/:patientId/ownership")
export class OwnershipHistoryController {
  public constructor(private readonly service: OwnershipHistoryService) {}

  @Get()
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "ownershipList",
    summary: "Sahiplik geçmişi",
    description:
      "Hasta için tüm sahiplik kayıtlarını döner. En yeni başlangıç tarihi üstte.",
  })
  public async list(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @CurrentActor() actor: ActorContext,
    @Query("limit") _limit?: string,
    @Query("offset") _offset?: string,
  ): Promise<{ items: Ownership[]; total: number }> {
    const tenantId = this.requireTenant(actor);
    const limit = Math.min(
      Math.max(parseInt(_limit ?? "20", 10) || 20, 1),
      200,
    );
    const offset = Math.max(parseInt(_offset ?? "0", 10) || 0, 0);
    return this.service.list(tenantId, { patientId, limit, offset }, actor);
  }

  @Get("active")
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "ownershipGetActive",
    summary: "Aktif sahiplik kaydı",
    description:
      "Hasta için aktif (endDate=null) sahiplik kaydını getirir. Aktif kayıt yoksa 404.",
  })
  public async active(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Ownership> {
    const tenantId = this.requireTenant(actor);
    const found = await this.service.findActiveByPatient(
      tenantId,
      patientId,
      actor,
    );
    if (!found) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0011",
        message: "Aktif sahiplik kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0011",
        details: { patientId },
      });
    }
    return found;
  }

  @Post()
  @RequirePermissions("clinic:patient:transfer")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "ownershipTransfer",
    summary: "Sahiplik devri",
    description:
      "Aktif sahiplik kaydı kapatılır + yeni aktif kayıt açılır. Patient.ownerId yeni sahibe güncellenir. Audit eventi + portal yenileme sinyali üretir.",
  })
  @ApiResponse({ status: 200, description: "Devir tamamlandı." })
  @ApiResponse({
    status: 404,
    description: "Hasta veya yeni sahip bulunamadı.",
  })
  @ApiResponse({ status: 409, description: "Aktif kayıt çakışması." })
  @ApiResponse({
    status: 422,
    description: "Validation hatası / arşivli hasta.",
  })
  public async transfer(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Body(new ZodValidationPipe(ownershipTransferInputSchema))
    body: OwnershipTransferInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ closed: Ownership | null; opened: Ownership }> {
    const tenantId = this.requireTenant(actor);
    return this.service.transfer(
      tenantId,
      patientId,
      {
        newOwnerId: body.newOwnerId,
        reason: body.reason,
        ...(body.otherNote !== undefined && { otherNote: body.otherNote }),
        ...(body.startDate !== undefined && { startDate: body.startDate }),
      },
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
