/**
 * @file Portal davet controller.
 * @module apps/api/modules/portal/portal.controller
 *
 * @description GOAL-025 portal erişim daveti REST API. Tenant ID
 *   URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 *   koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/portal/invitations`            — Davet oluştur
 *   (`user:user:invite`)
 * - `GET    /api/v1/portal/invitations?ownerId=...` — Owner
 *   davetlerini listele (`clinic:owner:read`)
 * - `DELETE /api/v1/portal/invitations/:id`         — Daveti iptal
 *   (`user:user:invite`)
 * - `POST   /api/v1/portal/invitations/accept`     — Davet kabul
 *   (public, token tabanlı)
 *
 * @security Accept endpoint public; geri kalanı PermissionsGuard
 *   altında ve tenant-scoped. Email davet response'unda görünür
 *   (PII; client kendi sorumluluğu).
 *
 * @since GOAL-025 (FAZ-2) portal erişim daveti
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
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  portalAcceptInputSchema,
  portalInviteInputSchema,
  portalListQuerySchema,
  type PortalAcceptInput,
  type PortalInvitation,
  type PortalInviteInput,
} from "@vetniva/contracts";

import { PortalService } from "./portal.service.js";

@ApiTags("portal")
@UseGuards(PermissionsGuard)
@Controller("api/v1/portal/invitations")
export class PortalController {
  public constructor(private readonly service: PortalService) {}

  @Post()
  @RequirePermissions("user:user:invite")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "portalInviteCreate",
    summary: "Portal daveti oluştur",
    description:
      "Owner için süreli (1-30 gün) tek kullanımlık portal daveti " +
      "oluşturur. Cross-tenant owner/patient → 404.",
  })
  @ApiResponse({ status: 201, description: "Davet oluşturuldu." })
  @ApiResponse({ status: 404, description: "Owner veya hasta bulunamadı." })
  @ApiResponse({ status: 422, description: "Validation hatası." })
  public async invite(
    @Body(new ZodValidationPipe(portalInviteInputSchema))
    body: PortalInviteInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<PortalInvitation> {
    const tenantId = this.requireTenant(actor);
    return this.service.invite(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:owner:read")
  @ApiOperation({
    operationId: "portalInviteList",
    summary: "Owner davetleri",
    description: "Tenant-scoped, ownerId filtreli davet listesi.",
  })
  public async list(
    @Query(new ZodValidationPipe(portalListQuerySchema))
    query: { ownerId: string },
    @CurrentActor() actor: ActorContext,
  ): Promise<{ items: PortalInvitation[]; total: number }> {
    const tenantId = this.requireTenant(actor);
    const items = this.service.listForOwner(tenantId, query.ownerId, actor);
    return { items, total: items.length };
  }

  @Delete(":id")
  @RequirePermissions("user:user:invite")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "portalInviteRevoke",
    summary: "Daveti iptal",
    description:
      "Pending durumundaki davetleri iptal eder. Diğer durumlar " +
      "idempotent (no-op).",
  })
  public async revoke(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<PortalInvitation> {
    const tenantId = this.requireTenant(actor);
    return this.service.revoke(tenantId, id, actor);
  }

  /**
   * Public accept endpoint. Token URL query veya body'de gelir;
   * kabul sonrası session token httpOnly cookie olarak set edilir.
   * Frontend bu endpoint'i `/portal/accept?token=...` form submit
   * ile çağırır.
   */
  @Public()
  @Post("accept")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "portalInviteAccept",
    summary: "Davet kabul (public)",
    description:
      "Token ile daveti kabul eder; PortalUser ve session token " +
      "oluşturur. Pending + expired değilse başarılı; accepted ise " +
      "409; expired/revoked ise 410.",
  })
  public async accept(
    @Body(new ZodValidationPipe(portalAcceptInputSchema))
    body: PortalAcceptInput,
    @Req() request: Request & { requestId?: string },
    @Res({ passthrough: true }) _response: Response,
  ): Promise<{ portalUserId: string; sessionToken: string }> {
    // Public endpoint: actor yoksa (development default placeholder
    // olabilir) kabul edilebilir; actor varsa o kullanılır. Audit
    // bağlamı için minimal context üret.
    const actor: ActorContext | undefined = (request as Request & { actor?: ActorContext }).actor;
    return this.service.acceptInvitation(body, actor);
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
